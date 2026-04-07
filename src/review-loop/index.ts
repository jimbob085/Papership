import { MappingStore } from "../store/mappingStore";
import { PaperclipClient } from "../clients/paperclipClient";
import { NexusReviewClient } from "./nexus-client";
import { PaperclipFeedbackClient } from "./paperclip-feedback";
import { classifyRun } from "./classifier";
import { routeToAgent } from "./router";
import { AGENT_CAPABILITIES } from "./agent-capabilities";
import { getWatermark, setWatermark } from "./watermark";
import { logger } from "../lib/logger";
import type { AppConfig } from "../config";

const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export function isNullRun(result: string | null | undefined): boolean {
  if (!result) return true;
  const normalized = result.toLowerCase().trim();
  const nullPatterns = [
    'no assignments',
    'no tasks',
    'empty queue',
    'empty inbox',
    'exiting cleanly',
    'exiting heartbeat',
    'timer heartbeat',
    'no action required',
    'nothing to do',
    '0 tasks',
    'no work',
  ];
  return nullPatterns.some(pattern => normalized.includes(pattern));
}

interface HeartbeatRun {
  id: string;
  agentId: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  resultJson: { result?: string } | null;
}

interface PaperclipAgent {
  id: string;
  name: string;
  capabilities: string | null;
}

export class ReviewLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private store: MappingStore;
  private paperclipBaseUrl: string;
  private paperclipApiKey: string;
  private companyId: string | null = null;
  private nexusClient: NexusReviewClient;
  private feedbackClient: PaperclipFeedbackClient;
  private agentCache: Map<string, PaperclipAgent> = new Map();

  constructor(config: AppConfig, store: MappingStore) {
    this.store = store;
    this.paperclipBaseUrl = config.paperclip.baseUrl.replace(/\/$/, "");
    this.paperclipApiKey = config.paperclip.apiKey;
    this.nexusClient = new NexusReviewClient(config.permaship.baseUrl, config.permaship.apiKey);
    this.feedbackClient = new PaperclipFeedbackClient(config.paperclip.baseUrl, config.paperclip.apiKey);
  }

  start(): void {
    if (this.timer) return;
    logger.info("Review loop started", { pollIntervalMs: DEFAULT_POLL_INTERVAL_MS });

    this.timer = setInterval(() => {
      this.poll().catch((err) => {
        logger.error("Review loop poll failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, DEFAULT_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("Review loop stopped");
    }
  }

  private async ensureCompanyId(): Promise<string | null> {
    if (this.companyId) return this.companyId;
    try {
      const res = await fetch(`${this.paperclipBaseUrl}/api/companies`, {
        headers: { Authorization: `Bearer ${this.paperclipApiKey}` },
      });
      if (res.ok) {
        const companies = (await res.json()) as Array<{ id: string }>;
        if (companies.length > 0) this.companyId = companies[0].id;
      }
    } catch { /* ignore */ }
    return this.companyId;
  }

  private async getAgent(agentId: string): Promise<PaperclipAgent | null> {
    if (this.agentCache.has(agentId)) return this.agentCache.get(agentId)!;

    const companyId = await this.ensureCompanyId();
    if (!companyId) return null;

    try {
      const res = await fetch(`${this.paperclipBaseUrl}/api/companies/${companyId}/agents`, {
        headers: { Authorization: `Bearer ${this.paperclipApiKey}` },
      });
      if (res.ok) {
        const agents = (await res.json()) as PaperclipAgent[];
        for (const a of agents) this.agentCache.set(a.id, a);
      }
    } catch { /* ignore */ }

    return this.agentCache.get(agentId) ?? null;
  }

  private async getIssueForRun(run: HeartbeatRun): Promise<{ id: string; title: string; description?: string | null } | null> {
    // Check if we have a mapping with an issueId
    const mapping = this.store.getByRunId(run.id);
    if (mapping?.paperclipIssueId) {
      // Fetch full issue details to get description
      const detail = await this.fetchIssueDetail(mapping.paperclipIssueId);
      if (detail) return detail;
      return { id: mapping.paperclipIssueId, title: mapping.paperclipTaskId ?? 'Unknown', description: null };
    }

    // Fall back to searching issues assigned to this agent
    const companyId = await this.ensureCompanyId();
    if (!companyId) return null;

    try {
      const res = await fetch(
        `${this.paperclipBaseUrl}/api/companies/${companyId}/issues?assigneeAgentId=${run.agentId}`,
        { headers: { Authorization: `Bearer ${this.paperclipApiKey}` } },
      );
      if (res.ok) {
        const issues = (await res.json()) as Array<{ id: string; title: string; description?: string | null }>;
        if (issues.length > 0) return { id: issues[0].id, title: issues[0].title, description: issues[0].description ?? null };
      }
    } catch { /* ignore */ }

    return null;
  }

  private async fetchIssueDetail(issueId: string): Promise<{ id: string; title: string; description?: string | null } | null> {
    try {
      const res = await fetch(
        `${this.paperclipBaseUrl}/api/issues/${issueId}`,
        { headers: { Authorization: `Bearer ${this.paperclipApiKey}` } },
      );
      if (res.ok) {
        const issue = (await res.json()) as { id: string; title: string; description?: string | null };
        return { id: issue.id, title: issue.title, description: issue.description ?? null };
      }
    } catch { /* ignore */ }
    return null;
  }

  async poll(): Promise<void> {
    const companyId = await this.ensureCompanyId();
    if (!companyId) return;

    const watermark = getWatermark(this.store);

    // Fetch recent heartbeat runs
    let runs: HeartbeatRun[];
    try {
      const res = await fetch(
        `${this.paperclipBaseUrl}/api/companies/${companyId}/heartbeat-runs`,
        { headers: { Authorization: `Bearer ${this.paperclipApiKey}` } },
      );
      if (!res.ok) return;
      runs = (await res.json()) as HeartbeatRun[];
    } catch {
      return;
    }

    // Filter for runs completed after the watermark
    const completed = runs.filter(
      (r) =>
        r.status === "succeeded" &&
        r.finishedAt &&
        r.finishedAt > watermark
    );

    if (completed.length === 0) return;

    logger.info("Review loop: new completed runs", { count: completed.length });

    let latestFinished = watermark;

    for (const run of completed) {
      try {
        const agent = await this.getAgent(run.agentId);
        const issue = await this.getIssueForRun(run);
        const resultSummary = run.resultJson?.result ?? "";

        if (isNullRun(run.resultJson?.result)) {
          logger.info("Skipping null/idle run", { runId: run.id });
          if (run.finishedAt && run.finishedAt > latestFinished) {
            latestFinished = run.finishedAt;
            setWatermark(this.store, latestFinished);
          }
          continue;
        }

        // Look up structured capabilities for this agent
        const agentUrlKey = agent?.name?.toLowerCase().replace(/\s+/g, '-') ?? '';
        const structuredCaps = AGENT_CAPABILITIES[agentUrlKey] ?? undefined;

        // Classify and route
        const domain = classifyRun({
          issueTitle: issue?.title ?? "",
          agentCapabilities: agent?.capabilities ?? "",
          resultSummary,
          structuredCapabilities: structuredCaps,
        });
        const nexusAgent = routeToAgent(domain);

        logger.info("Routing review", {
          runId: run.id,
          domain,
          nexusAgent,
          issueTitle: issue?.title,
        });

        // Request review from Nexus
        await this.nexusClient.requestReview({
          agentName: nexusAgent,
          issueTitle: issue?.title ?? `Heartbeat run ${run.id}`,
          issueDescription: issue?.description,
          runResult: resultSummary,
          issueId: issue?.id ?? "",
          runId: run.id,
        });

        // Only advance watermark after successful review request
        if (run.finishedAt && run.finishedAt > latestFinished) {
          latestFinished = run.finishedAt;
          setWatermark(this.store, latestFinished);
        }
      } catch (err) {
        logger.error("Review request failed for run, skipping", {
          runId: run.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

export function startReviewLoop(config: AppConfig, store: MappingStore): ReviewLoop {
  const loop = new ReviewLoop(config, store);
  loop.start();
  return loop;
}
