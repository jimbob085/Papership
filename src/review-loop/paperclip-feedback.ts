import { logger } from "../lib/logger";

export class PaperclipFeedbackClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async postComment(issueId: string, body: string): Promise<boolean> {
    const url = `${this.baseUrl}/api/issues/${issueId}/comments`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error("Failed to post review comment to Paperclip", {
        issueId,
        statusCode: res.status,
        body: text,
      });
      return false;
    }

    logger.info("Review comment posted to Paperclip", { issueId });
    return true;
  }
}
