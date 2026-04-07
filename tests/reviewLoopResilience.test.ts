import { describe, it, expect, vi } from "vitest";
import { ReviewLoop } from "../src/review-loop/index";
import { MappingStore } from "../src/store/mappingStore";
import { getWatermark, setWatermark } from "../src/review-loop/watermark";
import type { AppConfig } from "../src/config";
import path from "node:path";
import os from "node:os";

const TEST_CONFIG: AppConfig = {
  port: 3000,
  paperclip: { baseUrl: "http://localhost:3100", apiKey: "test-key" },
  permaship: {
    baseUrl: "http://localhost:3000",
    apiKey: "test-key",
    projectId: "test-project",
    repoKey: "test-repo",
    webhookSecret: "test-secret",
  },
  defaults: { ticketKind: "task", ticketPriority: "medium" },
};

function createTestLoop() {
  const tmpFile = path.join(os.tmpdir(), `review-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new MappingStore(tmpFile);

  const loop = new ReviewLoop(TEST_CONFIG, store);

  // Mock internal methods to avoid hitting real APIs
  const mockRuns = vi.fn().mockResolvedValue([]);
  const mockReview = vi.fn().mockResolvedValue("msg-123");

  // Access internals for mocking
  (loop as any).ensureCompanyId = vi.fn().mockResolvedValue("test-company");
  (loop as any).getAgent = vi.fn().mockResolvedValue({ id: "agent-1", name: "SRE", capabilities: "reliability" });
  (loop as any).getIssueForRun = vi.fn().mockResolvedValue({ id: "issue-1", title: "Fix latency" });
  (loop as any).nexusClient = { requestReview: mockReview };

  return { loop, store, mockReview, tmpFile };
}

describe("Review loop resilience", () => {
  it("partial batch failure: watermark only advances past successful runs", async () => {
    const { loop, store, mockReview } = createTestLoop();

    const pastTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    setWatermark(store, pastTime);

    const run1Time = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const run2Time = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const run3Time = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    // Mock fetch to return 3 completed runs
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: "run-1", agentId: "a1", status: "succeeded", finishedAt: run1Time, resultJson: { result: "done" } },
        { id: "run-2", agentId: "a2", status: "succeeded", finishedAt: run2Time, resultJson: { result: "done" } },
        { id: "run-3", agentId: "a3", status: "succeeded", finishedAt: run3Time, resultJson: { result: "done" } },
      ]),
    }) as any;

    // Run 1 succeeds, run 2 fails, run 3 succeeds
    mockReview
      .mockResolvedValueOnce("msg-1")
      .mockRejectedValueOnce(new Error("Nexus unreachable"))
      .mockResolvedValueOnce("msg-3");

    await loop.poll();

    // Watermark should be at run3Time (run 1 and 3 succeeded)
    // Run 2 failed but didn't block run 3
    const wm = getWatermark(store);
    expect(wm).toBe(run3Time);
    expect(mockReview).toHaveBeenCalledTimes(3);

    global.fetch = originalFetch;
  });

  it("transient error on single run does not abort remaining runs", async () => {
    const { loop, store, mockReview } = createTestLoop();

    const pastTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    setWatermark(store, pastTime);

    const run1Time = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const run2Time = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const run3Time = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const run4Time = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: "run-a", agentId: "a1", status: "succeeded", finishedAt: run1Time, resultJson: { result: "ok" } },
        { id: "run-b", agentId: "a2", status: "succeeded", finishedAt: run2Time, resultJson: { result: "ok" } },
        { id: "run-c", agentId: "a3", status: "succeeded", finishedAt: run3Time, resultJson: { result: "ok" } },
        { id: "run-d", agentId: "a4", status: "succeeded", finishedAt: run4Time, resultJson: { result: "ok" } },
      ]),
    }) as any;

    // First run fails, rest succeed
    mockReview
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("msg-2")
      .mockResolvedValueOnce("msg-3")
      .mockResolvedValueOnce("msg-4");

    // poll() should complete without throwing
    await expect(loop.poll()).resolves.toBeUndefined();

    // All 4 runs were attempted (not aborted after first failure)
    expect(mockReview).toHaveBeenCalledTimes(4);

    // Watermark advanced to the latest successful run
    const wm = getWatermark(store);
    expect(wm).toBe(run4Time);

    global.fetch = originalFetch;
  });
});
