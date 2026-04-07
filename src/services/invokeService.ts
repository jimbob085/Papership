import type { PaperclipInvokePayload } from "../types/paperclip";
import type { AppConfig } from "../config";
import { mapToPermaShipTicket } from "../lib/mapper";
import { PermaShipClient } from "../clients/permashipClient";
import { CallbackService } from "./callbackService";
import { MappingStore } from "../store/mappingStore";
import { logger } from "../lib/logger";

export class InvokeService {
  constructor(
    private config: AppConfig,
    private store: MappingStore,
    private permashipClient: PermaShipClient,
    private callbackService: CallbackService
  ) {}

  /**
   * Process a Paperclip invoke payload asynchronously.
   * Called after the 202 has already been returned to the caller.
   */
  async processInvoke(payload: PaperclipInvokePayload): Promise<void> {
    const { runId } = payload;

    try {
      // 1. Persist the mapping
      this.store.create({
        paperclipRunId: runId,
        paperclipTaskId: payload.taskId,
        paperclipAgentId: payload.agentId,
        paperclipIssueId: payload.issueIds?.[0],
        permashipProjectId: this.config.permaship.projectId,
      });

      logger.info("Mapping created", { paperclipRunId: runId });

      // 2. Map to PermaShip ticket
      const ticket = mapToPermaShipTicket(payload, {
        repoKey: this.config.permaship.repoKey,
        defaultKind: this.config.defaults.ticketKind,
        defaultPriority: this.config.defaults.ticketPriority,
      });

      // 3. Create PermaShip ticket
      const result = await this.permashipClient.createTicket(ticket, runId);

      // 4. Update mapping with ticket ID
      this.store.updateTicketId(runId, result.id);

      logger.info("Invoke processing complete", {
        paperclipRunId: runId,
        permashipTicketId: result.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Invoke processing failed", {
        paperclipRunId: runId,
        error: message,
      });
      this.store.updateStatus(runId, "create_failed", message);

      // Callback Paperclip with failure so the run doesn't hang
      await this.callbackService.sendCallback(runId, {
        status: "failed",
        result: "Bridge failed to create PermaShip ticket.",
        errorMessage: message,
      });
    }
  }
}
