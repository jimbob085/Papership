import fs from "node:fs";
import path from "node:path";

export interface BridgeMapping {
  paperclipRunId: string;
  paperclipTaskId: string | null;
  paperclipAgentId: string | null;
  permashipTicketId: string | null;
  permashipProjectId: string | null;
  status: string;
  latestEvent: string | null;
  callbackSent: boolean;
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
    permashipProjectId?: string;
  }): BridgeMapping {
    const now = new Date().toISOString();
    const entry: BridgeMapping = {
      paperclipRunId: mapping.paperclipRunId,
      paperclipTaskId: mapping.paperclipTaskId || null,
      paperclipAgentId: mapping.paperclipAgentId || null,
      permashipTicketId: null,
      permashipProjectId: mapping.permashipProjectId || null,
      status: "pending",
      latestEvent: null,
      callbackSent: false,
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
      mapping.updatedAt = new Date().toISOString();
      this.save();
    }
  }
}
