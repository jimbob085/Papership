import type { PaperclipCallbackPayload } from "../types/paperclip";
import { PaperclipClient } from "../clients/paperclipClient";
import { MappingStore } from "../store/mappingStore";
import { logger } from "../lib/logger";

export class CallbackService {
  constructor(
    private store: MappingStore,
    private paperclipClient: PaperclipClient
  ) {}

  async sendCallback(
    runId: string,
    payload: PaperclipCallbackPayload
  ): Promise<void> {
    const mapping = this.store.getByRunId(runId);

    if (!mapping) {
      logger.error("Cannot send callback: mapping not found", {
        paperclipRunId: runId,
      });
      return;
    }

    // Prevent duplicate callbacks
    if (mapping.callbackSent) {
      logger.warn("Callback already sent, skipping duplicate", {
        paperclipRunId: runId,
        permashipTicketId: mapping.permashipTicketId ?? undefined,
      });
      return;
    }

    try {
      await this.paperclipClient.sendCallback(runId, payload);
      this.store.markCallbackSent(runId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Callback send failed", {
        paperclipRunId: runId,
        error: message,
      });
    }
  }
}
