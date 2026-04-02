/**
 * HTTP client for communicating with a running Nexus instance.
 *
 * Nexus exposes a Fastify server on port 9000 with internal API endpoints
 * authenticated via X-Internal-Secret header. This client wraps those
 * endpoints to submit governance review requests and poll for results.
 */

import type {
  NexusConfig,
  ReviewRequest,
  GovernanceReview,
  SpecialistVerdict,
  NexusSpecialist,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 120_000;

/** All available Nexus specialists */
const ALL_SPECIALISTS: NexusSpecialist[] = [
  'ciso',
  'qa-manager',
  'sre',
  'ux-designer',
  'product-manager',
  'release-engineering',
  'finops',
  'voc',
];

export class NexusClient {
  private baseUrl: string;
  private secret: string;
  private specialists: NexusSpecialist[];
  private timeoutMs: number;

  constructor(config: NexusConfig) {
    this.baseUrl = config.nexusUrl.replace(/\/+$/, '');
    this.secret = config.internalSecret;
    this.specialists = config.activeSpecialists ?? ALL_SPECIALISTS;
    this.timeoutMs = config.reviewTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Check if Nexus is reachable */
  async healthCheck(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: `Nexus returned ${res.status}` };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Trigger a Nexus review cycle for a Paperclip issue.
   *
   * This calls Nexus's internal trigger endpoint, which kicks off
   * the multi-specialist review pipeline. The review runs asynchronously
   * inside Nexus; we poll for results.
   */
  async triggerReview(request: ReviewRequest): Promise<{ triggered: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/internal/trigger-nexus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': this.secret,
        },
        body: JSON.stringify({
          issueId: request.issueId,
          title: request.issueTitle,
          description: request.issueBody,
          assignee: request.assigneeAgent,
          companyId: request.companyId,
          specialists: this.specialists,
          source: 'paperclip-plugin',
          metadata: request.metadata,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { triggered: false, error: `Nexus returned ${res.status}: ${body}` };
      }

      return { triggered: true };
    } catch (err) {
      return {
        triggered: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Poll Nexus for the governance review result.
   *
   * Since Nexus runs reviews asynchronously (multi-agent deliberation
   * can take 30s to 2min), we poll the health/status endpoint until
   * the review completes or we hit the timeout.
   */
  async waitForReview(
    issueId: string,
    onProgress?: (message: string) => void
  ): Promise<GovernanceReview | null> {
    const start = Date.now();
    const pollInterval = 5_000;

    while (Date.now() - start < this.timeoutMs) {
      try {
        const res = await fetch(
          `${this.baseUrl}/api/internal/review-status?issueId=${encodeURIComponent(issueId)}`,
          {
            headers: { 'X-Internal-Secret': this.secret },
            signal: AbortSignal.timeout(10_000),
          }
        );

        if (res.ok) {
          const data = (await res.json()) as {
            status: string;
            review?: GovernanceReview;
          };

          if (data.status === 'completed' && data.review) {
            return data.review;
          }

          if (data.status === 'error') {
            onProgress?.(`Review failed for issue ${issueId}`);
            return null;
          }

          onProgress?.(`Review in progress (${Math.round((Date.now() - start) / 1000)}s)...`);
        }
      } catch {
        onProgress?.('Nexus unreachable, retrying...');
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    onProgress?.(`Review timed out after ${this.timeoutMs}ms`);
    return null;
  }

  /**
   * Standalone mode: when Nexus is not running as a separate service,
   * generate a governance review using the Paperclip plugin's own HTTP
   * client to call an LLM directly. This is a simplified single-pass
   * review (not the full multi-agent deliberation).
   *
   * This lets the plugin provide value even without a running Nexus instance,
   * using whatever LLM provider the user configures.
   */
  static buildStandaloneReviewPrompt(request: ReviewRequest): string {
    return `You are a senior engineering governance panel reviewing a proposed task before it is assigned to an AI coding agent.

TASK TO REVIEW:
Title: ${request.issueTitle}
Description: ${request.issueBody}
${request.assigneeAgent ? `Assigned to: ${request.assigneeAgent}` : ''}

Review this task from the following specialist perspectives and provide a structured verdict:

1. SECURITY (CISO): Could this introduce vulnerabilities? Does it touch auth, user data, or external APIs?
2. QUALITY (QA): Is the task well-defined? Are acceptance criteria clear? What edge cases exist?
3. RELIABILITY (SRE): Could this affect uptime, performance, or observability? Any deployment risks?
4. PRODUCT: Does this align with product goals? Any scope creep or missing context?

For each perspective, provide:
- Decision: APPROVE, FLAG (proceed with caution), or BLOCK (needs revision)
- Reasoning: 1-2 sentences
- Suggestions: Any specific recommendations

Then provide an overall decision: APPROVED, NEEDS-REVISION, or BLOCKED.

Respond in JSON format:
{
  "decision": "approved|needs-revision|blocked",
  "summary": "One paragraph overall assessment",
  "verdicts": [
    {
      "specialist": "ciso|qa-manager|sre|product-manager",
      "decision": "approve|flag|block",
      "reasoning": "...",
      "severity": "info|warning|critical",
      "suggestions": ["..."]
    }
  ]
}`;
  }

  /**
   * Parse a standalone LLM response into a GovernanceReview.
   */
  static parseStandaloneResponse(
    issueId: string,
    issueTitle: string,
    raw: string,
    durationMs: number
  ): GovernanceReview {
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          issueId,
          issueTitle,
          decision: 'needs-revision',
          verdicts: [],
          summary: 'Failed to parse governance review response.',
          reviewedAt: new Date().toISOString(),
          reviewDurationMs: durationMs,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        decision: string;
        summary: string;
        verdicts: SpecialistVerdict[];
      };

      return {
        issueId,
        issueTitle,
        decision: parsed.decision as GovernanceReview['decision'],
        verdicts: parsed.verdicts ?? [],
        summary: parsed.summary ?? 'Review completed.',
        reviewedAt: new Date().toISOString(),
        reviewDurationMs: durationMs,
      };
    } catch {
      return {
        issueId,
        issueTitle,
        decision: 'needs-revision',
        verdicts: [],
        summary: 'Failed to parse governance review response.',
        reviewedAt: new Date().toISOString(),
        reviewDurationMs: durationMs,
      };
    }
  }
}
