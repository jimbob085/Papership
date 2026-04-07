import { MappingStore } from "../store/mappingStore";
import { PaperclipClient } from "../clients/paperclipClient";
import { logger } from "../lib/logger";

const DEFAULT_STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class StallDetector {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: MappingStore,
    private paperclipClient: PaperclipClient,
    private stallThresholdMs = DEFAULT_STALL_THRESHOLD_MS
  ) {}

  start(): void {
    if (this.timer) return;
    logger.info("Stall detector started", {
      pollIntervalMs: POLL_INTERVAL_MS,
      stallThresholdMs: this.stallThresholdMs,
    });

    this.timer = setInterval(() => {
      this.detectAndResolve().catch((err) => {
        logger.error("Stall detection sweep failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("Stall detector stopped");
    }
  }

  async detectAndResolve(): Promise<void> {
    let stalledRuns: Array<{ id: string; agentId: string; startedAt: string }>;
    try {
      stalledRuns = await this.paperclipClient.getInProgressRunsSince(
        this.stallThresholdMs
      );
    } catch (err) {
      logger.error("Failed to query stalled runs from Paperclip", {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (stalledRuns.length === 0) return;

    logger.info("Stalled runs detected", { count: stalledRuns.length });

    for (const run of stalledRuns) {
      const stalledForMs = Date.now() - new Date(run.startedAt).getTime();

      logger.warn("Stalled heartbeat run detected", {
        eventType: "stall_detected",
        paperclipRunId: run.id,
        agentId: run.agentId,
        stalledForMs,
      });

      const mapping = this.store.getByRunId(run.id);

      if (!mapping) {
        logger.info("No mapping found for stalled run, skipping", {
          paperclipRunId: run.id,
        });
        continue;
      }

      if (mapping.callbackSent) {
        logger.info("Stalled run already has callback sent, skipping", {
          eventType: "stall_detected_already_completed",
          paperclipRunId: run.id,
        });
        continue;
      }

      if (!mapping.paperclipIssueId) {
        logger.info("Stalled run has no associated issue, skipping status update", {
          paperclipRunId: run.id,
        });
        continue;
      }

      try {
        await this.paperclipClient.updateIssueStatus(
          mapping.paperclipIssueId,
          "todo"
        );
        this.store.updateStatus(run.id, "stall_resolved");

        logger.info("Stalled run resolved, issue reset to todo", {
          eventType: "stall_resolved",
          paperclipRunId: run.id,
          paperclipIssueId: mapping.paperclipIssueId,
          stalledForMs,
        });
      } catch (err) {
        logger.error("Failed to resolve stalled run", {
          eventType: "stall_resolution_failed",
          paperclipRunId: run.id,
          paperclipIssueId: mapping.paperclipIssueId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
