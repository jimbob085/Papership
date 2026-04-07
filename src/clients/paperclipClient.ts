import type { AppConfig } from "../config";
import type { PaperclipCallbackPayload } from "../types/paperclip";
import { logger } from "../lib/logger";

export class PaperclipClient {
  private baseUrl: string;
  private apiKey: string;
  private companyId: string | null;

  constructor(config: AppConfig) {
    this.baseUrl = config.paperclip.baseUrl.replace(/\/$/, "");
    this.apiKey = config.paperclip.apiKey;
    this.companyId = (config.paperclip as any).companyId ?? null;
  }

  async sendCallback(
    runId: string,
    payload: PaperclipCallbackPayload
  ): Promise<void> {
    const url = `${this.baseUrl}/api/heartbeat-runs/${runId}/callback`;

    logger.info("Paperclip callback requested", {
      paperclipRunId: runId,
      status: payload.status,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Paperclip callback failed", {
        paperclipRunId: runId,
        statusCode: response.status,
        body,
      });
      throw new Error(`Paperclip callback error: ${response.status} ${body}`);
    }

    logger.info("Paperclip callback succeeded", { paperclipRunId: runId });
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    const url = `${this.baseUrl}/api/issues/${issueId}`;

    logger.info("Paperclip issue status update requested", { issueId, status });

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Paperclip issue status update failed", {
        issueId,
        status,
        statusCode: response.status,
        body,
      });
      throw new Error(`Paperclip issue update error: ${response.status} ${body}`);
    }

    logger.info("Paperclip issue status updated", { issueId, status });
  }

  async getInProgressRunsSince(
    thresholdMs: number
  ): Promise<Array<{ id: string; agentId: string; startedAt: string }>> {
    if (!this.companyId) {
      // Auto-discover companyId from /api/companies
      const companiesRes = await fetch(`${this.baseUrl}/api/companies`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (companiesRes.ok) {
        const companies = (await companiesRes.json()) as Array<{ id: string }>;
        if (companies.length > 0) {
          this.companyId = companies[0].id;
        }
      }
      if (!this.companyId) return [];
    }

    const url = `${this.baseUrl}/api/companies/${this.companyId}/heartbeat-runs`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      logger.error("Failed to fetch heartbeat runs", { statusCode: response.status });
      return [];
    }

    const runs = (await response.json()) as Array<{
      id: string;
      agentId: string;
      status: string;
      startedAt: string | null;
    }>;

    const now = Date.now();
    return runs
      .filter(
        (r) =>
          r.status === "in_progress" &&
          r.startedAt &&
          now - new Date(r.startedAt).getTime() > thresholdMs
      )
      .map((r) => ({ id: r.id, agentId: r.agentId, startedAt: r.startedAt! }));
  }
}
