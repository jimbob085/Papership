import { MappingStore } from "../store/mappingStore";
import { CallbackService } from "./callbackService";
import { logger } from "../lib/logger";
import type { PaperclipCallbackPayload } from "../types/paperclip";

const POLL_INTERVAL_MS = 60_000;

export class RetryScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: MappingStore,
    private callbackService: CallbackService
  ) {}

  start(): void {
    if (this.timer) return;
    logger.info("Retry scheduler started", { pollIntervalMs: POLL_INTERVAL_MS });

    this.timer = setInterval(() => {
      this.drainRetries().catch((err) => {
        logger.error("Retry drain failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, POLL_INTERVAL_MS);

    // Run once immediately on startup
    this.drainRetries().catch(() => {});
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("Retry scheduler stopped");
    }
  }

  private async drainRetries(): Promise<void> {
    const pending = this.store.getPendingRetries();
    if (pending.length === 0) return;

    logger.info("Processing pending retries", { count: pending.length });

    for (const mapping of pending) {
      const payload: PaperclipCallbackPayload = {
        status: mapping.status === "failed" ? "failed" : "succeeded",
        result: mapping.latestEvent ?? "",
        errorMessage: mapping.status === "failed" ? "Retried callback delivery" : null,
      };

      logger.info("Retrying callback", {
        paperclipRunId: mapping.paperclipRunId,
        attempt: mapping.retryCount + 1,
      });

      await this.callbackService.sendCallback(mapping.paperclipRunId, payload);
    }
  }
}
