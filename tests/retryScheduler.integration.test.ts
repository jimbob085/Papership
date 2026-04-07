import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MappingStore, type BridgeMapping } from "../src/store/mappingStore";
import { CallbackService } from "../src/services/callbackService";
import { PaperclipClient } from "../src/clients/paperclipClient";
import { RetryScheduler } from "../src/services/retryScheduler";
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
  const tmpFile = path.join(os.tmpdir(), `retry-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new MappingStore(tmpFile);
  const paperclipClient = new PaperclipClient(TEST_CONFIG);
  const callbackService = new CallbackService(store, paperclipClient);

  // Mock the actual HTTP call
  const sendSpy = vi.spyOn(paperclipClient, "sendCallback").mockResolvedValue();

  return { store, callbackService, paperclipClient, sendSpy, tmpFile };
}

function insertMapping(store: MappingStore, overrides: Partial<BridgeMapping> & { paperclipRunId: string }) {
  // Create via the store's create method, then patch fields
  store.create({ paperclipRunId: overrides.paperclipRunId });
  const mapping = store.getByRunId(overrides.paperclipRunId)!;

  if (overrides.callbackSent !== undefined) mapping.callbackSent = overrides.callbackSent;
  if (overrides.retryExhausted !== undefined) mapping.retryExhausted = overrides.retryExhausted;
  if (overrides.nextRetryAt !== undefined) mapping.nextRetryAt = overrides.nextRetryAt;
  if (overrides.retryCount !== undefined) mapping.retryCount = overrides.retryCount;
  if (overrides.status !== undefined) mapping.status = overrides.status;
  mapping.updatedAt = new Date().toISOString();

  // Force save by updating status (triggers internal save)
  store.updateStatus(overrides.paperclipRunId, mapping.status, mapping.latestEvent ?? undefined);
  // Re-apply fields that updateStatus may not cover
  const m2 = store.getByRunId(overrides.paperclipRunId)!;
  if (overrides.callbackSent !== undefined) m2.callbackSent = overrides.callbackSent;
  if (overrides.retryExhausted !== undefined) m2.retryExhausted = overrides.retryExhausted;
  if (overrides.nextRetryAt !== undefined) m2.nextRetryAt = overrides.nextRetryAt;
  if (overrides.retryCount !== undefined) m2.retryCount = overrides.retryCount;

  // Write directly to file to persist all fields
  const raw = JSON.parse(fs.readFileSync((store as any).filePath, "utf-8"));
  const idx = raw.mappings.findIndex((m: any) => m.paperclipRunId === overrides.paperclipRunId);
  if (idx >= 0) Object.assign(raw.mappings[idx], overrides);
  fs.writeFileSync((store as any).filePath, JSON.stringify(raw, null, 2));

  // Reload the store
  (store as any).data = JSON.parse(fs.readFileSync((store as any).filePath, "utf-8"));
}

describe("RetryScheduler integration", () => {
  let scheduler: RetryScheduler;
  let cleanup: (() => void)[] = [];

  afterEach(() => {
    scheduler?.stop();
    cleanup.forEach((fn) => fn());
    cleanup = [];
  });

  it("delivers eligible entries with nextRetryAt in the past", async () => {
    const { store, callbackService, sendSpy, tmpFile } = createTestDeps();
    cleanup.push(() => { try { fs.unlinkSync(tmpFile); } catch {} });

    insertMapping(store, {
      paperclipRunId: "retry-eligible-1",
      callbackSent: false,
      retryExhausted: false,
      nextRetryAt: new Date(Date.now() - 60_000).toISOString(),
      retryCount: 1,
      status: "succeeded",
    });

    scheduler = new RetryScheduler(store, callbackService);
    // Don't start the interval, just call drain directly
    await (scheduler as any).drainRetries();

    expect(sendSpy).toHaveBeenCalledWith("retry-eligible-1", expect.objectContaining({
      status: "succeeded",
    }));
  });

  it("skips entries with nextRetryAt in the future", async () => {
    const { store, callbackService, sendSpy, tmpFile } = createTestDeps();
    cleanup.push(() => { try { fs.unlinkSync(tmpFile); } catch {} });

    insertMapping(store, {
      paperclipRunId: "retry-future-1",
      callbackSent: false,
      retryExhausted: false,
      nextRetryAt: new Date(Date.now() + 600_000).toISOString(),
      retryCount: 1,
      status: "succeeded",
    });

    scheduler = new RetryScheduler(store, callbackService);
    await (scheduler as any).drainRetries();

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("skips exhausted entries", async () => {
    const { store, callbackService, sendSpy, tmpFile } = createTestDeps();
    cleanup.push(() => { try { fs.unlinkSync(tmpFile); } catch {} });

    insertMapping(store, {
      paperclipRunId: "retry-exhausted-1",
      callbackSent: false,
      retryExhausted: true,
      nextRetryAt: new Date(Date.now() - 60_000).toISOString(),
      retryCount: 5,
      status: "failed",
    });

    scheduler = new RetryScheduler(store, callbackService);
    await (scheduler as any).drainRetries();

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("skips already-sent entries", async () => {
    const { store, callbackService, sendSpy, tmpFile } = createTestDeps();
    cleanup.push(() => { try { fs.unlinkSync(tmpFile); } catch {} });

    insertMapping(store, {
      paperclipRunId: "retry-sent-1",
      callbackSent: true,
      retryExhausted: false,
      nextRetryAt: new Date(Date.now() - 60_000).toISOString(),
      retryCount: 0,
      status: "succeeded",
    });

    scheduler = new RetryScheduler(store, callbackService);
    await (scheduler as any).drainRetries();

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("processes multiple eligible entries in one tick", async () => {
    const { store, callbackService, sendSpy, tmpFile } = createTestDeps();
    cleanup.push(() => { try { fs.unlinkSync(tmpFile); } catch {} });

    const pastTime = new Date(Date.now() - 60_000).toISOString();

    insertMapping(store, {
      paperclipRunId: "retry-multi-1",
      callbackSent: false,
      retryExhausted: false,
      nextRetryAt: pastTime,
      retryCount: 1,
      status: "succeeded",
    });

    insertMapping(store, {
      paperclipRunId: "retry-multi-2",
      callbackSent: false,
      retryExhausted: false,
      nextRetryAt: pastTime,
      retryCount: 2,
      status: "failed",
    });

    insertMapping(store, {
      paperclipRunId: "retry-multi-3",
      callbackSent: false,
      retryExhausted: false,
      nextRetryAt: pastTime,
      retryCount: 1,
      status: "succeeded",
    });

    scheduler = new RetryScheduler(store, callbackService);
    await (scheduler as any).drainRetries();

    expect(sendSpy).toHaveBeenCalledTimes(3);
    expect(sendSpy).toHaveBeenCalledWith("retry-multi-1", expect.anything());
    expect(sendSpy).toHaveBeenCalledWith("retry-multi-2", expect.anything());
    expect(sendSpy).toHaveBeenCalledWith("retry-multi-3", expect.anything());
  });
});
