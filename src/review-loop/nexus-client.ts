import { logger } from "../lib/logger";

export interface NexusReviewRequest {
  agentName: string;
  issueTitle: string;
  issueDescription?: string | null;
  runResult: string;
  issueId: string;
  runId: string;
}

export class NexusReviewClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async getAuthToken(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/auth/token`);
    if (!res.ok) throw new Error(`Failed to get Nexus auth token: ${res.status}`);
    const data = (await res.json()) as { token: string };
    return data.token;
  }

  async requestReview(params: NexusReviewRequest): Promise<string | null> {
    const token = await this.getAuthToken();

    const taskSpec = params.issueDescription
      ? params.issueDescription.slice(0, 1000)
      : "No description provided";

    const message = `@${params.agentName} Review request for Paperclip issue.\n\n**Issue:** ${params.issueTitle}\n**Run ID:** ${params.runId}\n**Issue ID:** ${params.issueId}\n\n**Task spec:**\n${taskSpec}\n\n**Agent output:**\n${params.runResult.slice(0, 3000)}\n\nPlease review this output and provide feedback: APPROVE, NEEDS_CHANGES, or REJECT with reasoning.`;

    const res = await fetch(`${this.baseUrl}/api/chat/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: message }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error("Failed to send review request to Nexus", {
        statusCode: res.status,
        body,
      });
      return null;
    }

    const data = (await res.json()) as { success: boolean; messageId: string };
    logger.info("Review request sent to Nexus", {
      agentName: params.agentName,
      issueId: params.issueId,
      messageId: data.messageId,
    });
    return data.messageId;
  }
}
