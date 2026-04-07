import fs from "node:fs";
import path from "node:path";

export interface BridgeMapping {
  paperclipRunId: string;
  paperclipTaskId: string | null;
  paperclipAgentId: string | null;
  paperclipIssueId: string | null;
  permashipTicketId: string | null;
  permashipProjectId: string | null;
  status: string;
  latestEvent: string | null;
  callbackSent: boolean;
  retryCount: number;
  lastRetryAt: string | null;
  nextRetryAt: string | null;
  retryExhausted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoreData {
  mappings: BridgeMapping[];
}

export class MappingStore {
  private filePath: string;
  private data: StoreData;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(process.cwd(), "bridge-data.json");
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw) as StoreData;
    } catch {
      return { mappings: [] };
    }
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  create(mapping: {
    paperclipRunId: string;
    paperclipTaskId?: string;
    paperclipAgentId?: string;
    paperclipIssueId?: string;
    permashipProjectId?: string;
  }): BridgeMapping {
    const now = new Date().toISOString();
    const entry: BridgeMapping = {
      paperclipRunId: mapping.paperclipRunId,
      paperclipTaskId: mapping.paperclipTaskId || null,
      paperclipAgentId: mapping.paperclipAgentId || null,
      paperclipIssueId: mapping.paperclipIssueId || null,
      permashipTicketId: null,
      permashipProjectId: mapping.permashipProjectId || null,
      status: "pending",
      latestEvent: null,
      callbackSent: false,
      retryCount: 0,
      lastRetryAt: null,
      nextRetryAt: null,
      retryExhausted: false,
      createdAt: now,
      updatedAt: now,
    };
    this.data.mappings.push(entry);
    this.save();
    return entry;
  }

  getByRunId(runId: string): BridgeMapping | undefined {
    return this.data.mappings.find((m) => m.paperclipRunId === runId);
  }

  getByTicketId(ticketId: string): BridgeMapping | undefined {
    return this.data.mappings.find((m) => m.permashipTicketId === ticketId);
  }

  updateTicketId(runId: string, ticketId: string): void {
    const mapping = this.getByRunId(runId);
    if (mapping) {
      mapping.permashipTicketId = ticketId;
      mapping.status = "ticket_created";
      mapping.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  updateStatus(runId: string, status: string, event?: string): void {
    const mapping = this.getByRunId(runId);
    if (mapping) {
      mapping.status = status;
      if (event) mapping.latestEvent = event;
      mapping.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  markCallbackSent(runId: string): void {
    const mapping = this.getByRunId(runId);
    if (mapping) {
      mapping.callbackSent = true;
      mapping.retryCount = 0;
      mapping.nextRetryAt = null;
      mapping.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  /** Backoff intervals in ms: 30s, 2m, 8m, 32m */
  static readonly BACKOFF_INTERVALS = [30_000, 120_000, 480_000, 1_920_000];
  static readonly MAX_RETRIES = 5;

  markRetryNeeded(runId: string): void {
    const mapping = this.getByRunId(runId);
    if (!mapping) return;

    mapping.retryCount += 1;
    mapping.lastRetryAt = new Date().toISOString();

    if (mapping.retryCount >= MappingStore.MAX_RETRIES) {
      mapping.retryExhausted = true;
      mapping.nextRetryAt = null;
    } else {
      const backoffMs = MappingStore.BACKOFF_INTERVALS[
        Math.min(mapping.retryCount - 1, MappingStore.BACKOFF_INTERVALS.length - 1)
      ];
      mapping.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    }

    mapping.updatedAt = new Date().toISOString();
    this.save();
  }

  getPendingRetries(): BridgeMapping[] {
    const now = new Date().toISOString();
    return this.data.mappings.filter(
      (m) =>
        !m.callbackSent &&
        !m.retryExhausted &&
        m.nextRetryAt !== null &&
        m.nextRetryAt <= now
    );
  }
}
