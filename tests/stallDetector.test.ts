import { describe, it, expect, vi } from "vitest";
import { MappingStore } from "../src/store/mappingStore";
import { PaperclipClient } from "../src/clients/paperclipClient";
import { StallDetector } from "../src/services/stallDetector";
import type { AppConfig } from "../src/config";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const TEST_CONFIG: AppConfig = {
  port: 3000,
  paperclip: { baseUrl: "http://localhost:3100", apiKey: "test-key" },
  permaship: {
    baseUrl: "http://localhost:8001",
    apiKey: "test-key",
    projectId: "test-project",
    repoKey: "test-repo",
    webhookSecret: "test-secret",
  },
  defaults: { ticketKind: "task", ticketPriority: "medium" },
};

function createTestDeps() {
  const tmpFile = path.join(os.tmpdir(), `stall-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new MappingStore(tmpFile);
  const client = new PaperclipClient(TEST_CONFIG);

  const getStalledSpy = vi.spyOn(client, "getInProgressRunsSince").mockResolvedValue([]);
  const updateIssueSpy = vi.spyOn(client, "updateIssueStatus").mockResolvedValue();

  const detector = new StallDetector(store, client, 30 * 60 * 1000);

  return { store, client, detector, getStalledSpy, updateIssueSpy, tmpFile };
}

function seedMapping(store: MappingStore, overrides: {
  paperclipRunId: string;
  paperclipIssueId?: string;
  callbackSent?: boolean;
  permashipTicketId?: string;
}) {
  store.create({
    paperclipRunId: overrides.paperclipRunId,
    paperclipIssueId: overrides.paperclipIssueId,
  });
  if (overrides.permashipTicketId) {
    store.updateTicketId(overrides.paperclipRunId, overrides.permashipTicketId);
  }
  if (overrides.callbackSent) {
    store.markCallbackSent(overrides.paperclipRunId);
  }
}

describe("StallDetector", () => {
  it("detects and resolves a stalled run with mapping and issueId", async () => {
    const { store, detector, getStalledSpy, updateIssueSpy } = createTestDeps();

    seedMapping(store, {
      paperclipRunId: "run-stall-1",
      paperclipIssueId: "issue-stall-1",
    });

    getStalledSpy.mockResolvedValue([
      { id: "run-stall-1", agentId: "agent-1", startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
    ]);

    await detector.detectAndResolve();

    expect(updateIssueSpy).toHaveBeenCalledWith("issue-stall-1", "todo");
    const mapping = store.getByRunId("run-stall-1");
    expect(mapping?.status).toBe("stall_resolved");
  });

  it("skips already-completed mapping (callbackSent=true)", async () => {
    const { store, detector, getStalledSpy, updateIssueSpy } = createTestDeps();

    seedMapping(store, {
      paperclipRunId: "run-stall-2",
      paperclipIssueId: "issue-stall-2",
      callbackSent: true,
    });

    getStalledSpy.mockResolvedValue([
      { id: "run-stall-2", agentId: "agent-1", startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
    ]);

    await detector.detectAndResolve();

    expect(updateIssueSpy).not.toHaveBeenCalled();
  });

  it("skips when no mapping found for stalled run", async () => {
    const { detector, getStalledSpy, updateIssueSpy } = createTestDeps();

    getStalledSpy.mockResolvedValue([
      { id: "run-unknown", agentId: "agent-1", startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
    ]);

    await detector.detectAndResolve();

    expect(updateIssueSpy).not.toHaveBeenCalled();
  });

  it("skips when paperclipIssueId is null", async () => {
    const { store, detector, getStalledSpy, updateIssueSpy } = createTestDeps();

    seedMapping(store, {
      paperclipRunId: "run-stall-3",
      // no paperclipIssueId
    });

    getStalledSpy.mockResolvedValue([
      { id: "run-stall-3", agentId: "agent-1", startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
    ]);

    await detector.detectAndResolve();

    expect(updateIssueSpy).not.toHaveBeenCalled();
  });

  it("does not throw when updateIssueStatus fails", async () => {
    const { store, detector, getStalledSpy, updateIssueSpy } = createTestDeps();

    seedMapping(store, {
      paperclipRunId: "run-stall-4",
      paperclipIssueId: "issue-stall-4",
    });

    getStalledSpy.mockResolvedValue([
      { id: "run-stall-4", agentId: "agent-1", startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
    ]);
    updateIssueSpy.mockRejectedValue(new Error("Paperclip unreachable"));

    await expect(detector.detectAndResolve()).resolves.toBeUndefined();
  });

  it("processes multiple stalled runs in one pass", async () => {
    const { store, detector, getStalledSpy, updateIssueSpy } = createTestDeps();

    seedMapping(store, { paperclipRunId: "run-multi-1", paperclipIssueId: "issue-m1" });
    seedMapping(store, { paperclipRunId: "run-multi-2", paperclipIssueId: "issue-m2" });

    getStalledSpy.mockResolvedValue([
      { id: "run-multi-1", agentId: "agent-1", startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
      { id: "run-multi-2", agentId: "agent-2", startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
    ]);

    await detector.detectAndResolve();

    expect(updateIssueSpy).toHaveBeenCalledTimes(2);
    expect(updateIssueSpy).toHaveBeenCalledWith("issue-m1", "todo");
    expect(updateIssueSpy).toHaveBeenCalledWith("issue-m2", "todo");
  });
});
