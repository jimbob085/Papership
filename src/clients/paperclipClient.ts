import type { AppConfig } from "../config";
import type { PaperclipCallbackPayload } from "../types/paperclip";
import { logger } from "../lib/logger";

export class PaperclipClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: AppConfig) {
    this.baseUrl = config.paperclip.baseUrl.replace(/\/$/, "");
    this.apiKey = config.paperclip.apiKey;
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
}
