import { describe, it, expect, vi, beforeEach } from "vitest";
import { MappingStore } from "../src/store/mappingStore";
import { CallbackService } from "../src/services/callbackService";
import { WebhookService } from "../src/services/webhookService";
import { PaperclipClient } from "../src/clients/paperclipClient";
import type { AppConfig } from "../src/config";
import path from "node:path";
import os from "node:os";

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
  const tmpFile = path.join(os.tmpdir(), `sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new MappingStore(tmpFile);
  const paperclipClient = new PaperclipClient(TEST_CONFIG);
  const callbackService = new CallbackService(store, paperclipClient);

  vi.spyOn(paperclipClient, "sendCallback").mockResolvedValue();
  const updateSpy = vi.spyOn(paperclipClient, "updateIssueStatus").mockResolvedValue();

  const webhookService = new WebhookService(store, callbackService, paperclipClient);

  return { store, webhookService, paperclipClient, updateSpy };
}

describe("Bidirectional status sync", () => {
  it("stores paperclipIssueId when issueIds is present in invoke", () => {
    const tmpFile = path.join(os.tmpdir(), `sync-issue-${Date.now()}.json`);
    const store = new MappingStore(tmpFile);

    store.create({
      paperclipRunId: "run-1",
      paperclipIssueId: "issue-abc-123",
    });

    const mapping = store.getByRunId("run-1");
    expect(mapping?.paperclipIssueId).toBe("issue-abc-123");
  });

  it("stores null paperclipIssueId when issueIds is absent", () => {
    const tmpFile = path.join(os.tmpdir(), `sync-no-issue-${Date.now()}.json`);
    const store = new MappingStore(tmpFile);

    store.create({ paperclipRunId: "run-2" });

    const mapping = store.getByRunId("run-2");
    expect(mapping?.paperclipIssueId).toBeNull();
  });

  it("calls updateIssueStatus('done') on ready_for_review when issueId is present", async () => {
    const { store, webhookService, updateSpy } = createTestDeps();

    store.create({
      paperclipRunId: "run-3",
      paperclipIssueId: "issue-xyz",
    });
    store.updateTicketId("run-3", "ticket-1");

    await webhookService.handleEvent({
      event: "ready_for_review",
      ticketId: "ticket-1",
    });

    expect(updateSpy).toHaveBeenCalledWith("issue-xyz", "done");
  });

  it("calls updateIssueStatus('todo') on ticket.failed when issueId is present", async () => {
    const { store, webhookService, updateSpy } = createTestDeps();

    store.create({
      paperclipRunId: "run-4",
      paperclipIssueId: "issue-fail",
    });
    store.updateTicketId("run-4", "ticket-2");

    await webhookService.handleEvent({
      event: "ticket.failed",
      ticketId: "ticket-2",
      data: { errorMessage: "something broke" },
    });

    expect(updateSpy).toHaveBeenCalledWith("issue-fail", "todo");
  });

  it("does NOT call updateIssueStatus when paperclipIssueId is null", async () => {
    const { store, webhookService, updateSpy } = createTestDeps();

    store.create({ paperclipRunId: "run-5" });
    store.updateTicketId("run-5", "ticket-3");

    await webhookService.handleEvent({
      event: "ready_for_review",
      ticketId: "ticket-3",
    });

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("does not block callback when updateIssueStatus fails", async () => {
    const { store, webhookService, paperclipClient, updateSpy } = createTestDeps();

    updateSpy.mockRejectedValue(new Error("Paperclip unreachable"));
    const callbackSpy = vi.spyOn(paperclipClient, "sendCallback");

    store.create({
      paperclipRunId: "run-6",
      paperclipIssueId: "issue-broken",
    });
    store.updateTicketId("run-6", "ticket-4");

    // Should not throw even though updateIssueStatus fails
    await expect(
      webhookService.handleEvent({
        event: "ready_for_review",
        ticketId: "ticket-4",
      })
    ).resolves.toBeUndefined();

    // Callback was still sent
    expect(callbackSpy).toHaveBeenCalledWith("run-6", expect.objectContaining({
      status: "succeeded",
    }));
  });
});
