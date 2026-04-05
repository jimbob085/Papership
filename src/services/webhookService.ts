import type { PermaShipWebhookPayload } from "../types/permaship";
import type { PaperclipCallbackPayload } from "../types/paperclip";
import { MappingStore } from "../store/mappingStore";
import { CallbackService } from "./callbackService";
import { logger } from "../lib/logger";

/**
 * Translates a PermaShip webhook event into the appropriate Paperclip callback.
 */
export function translateEvent(
  event: string,
  data?: Record<string, unknown>
): PaperclipCallbackPayload | null {
  switch (event) {
    case "ready_for_review":
      return {
        status: "succeeded",
        result:
          "PermaShip completed the engineering task and marked it ready for review.",
        errorMessage: null,
      };

    case "ticket.failed": {
      const detail =
        data && typeof data.errorMessage === "string"
          ? data.errorMessage
          : "PermaShip failed while executing the engineering task.";
      return {
        status: "failed",
        result: "PermaShip failed while executing the engineering task.",
        errorMessage: detail,
      };
    }

    default:
      return null;
  }
}

export class WebhookService {
  constructor(
    private store: MappingStore,
    private callbackService: CallbackService
  ) {}

  async handleEvent(payload: PermaShipWebhookPayload): Promise<void> {
    const { event, ticketId, data } = payload;

    logger.info("Webhook received", {
      permashipTicketId: ticketId,
      event,
    });

    // Find the mapping
    const mapping = this.store.getByTicketId(ticketId);
    if (!mapping) {
      logger.warn("No mapping found for ticket, storing event only", {
        permashipTicketId: ticketId,
        event,
      });
      return;
    }

    const runId = mapping.paperclipRunId;

    // Update mapping with latest event
    this.store.updateStatus(runId, event, event);

    // Translate to callback
    const callbackPayload = translateEvent(event, data);

    if (callbackPayload) {
      await this.callbackService.sendCallback(runId, callbackPayload);
      this.store.updateStatus(runId, `callback_${callbackPayload.status}`, event);
    } else {
      logger.info("Unrecognized event, no callback sent", {
        paperclipRunId: runId,
        permashipTicketId: ticketId,
        event,
      });
    }
  }
}
