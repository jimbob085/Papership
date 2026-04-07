import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createInvokeRouter } from "../src/routes/invoke";
import { InvokeService } from "../src/services/invokeService";
import { MappingStore } from "../src/store/mappingStore";
import { CallbackService } from "../src/services/callbackService";
import { PaperclipClient } from "../src/clients/paperclipClient";
import { PermaShipClient } from "../src/clients/permashipClient";
import type { AppConfig } from "../src/config";
import fs from "node:fs";
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

function createTestApp(apiKey?: string) {
  const tmpFile = path.join(os.tmpdir(), `bridge-test-${Date.now()}.json`);
  const store = new MappingStore(tmpFile);
  const paperclipClient = new PaperclipClient(TEST_CONFIG);
  const permashipClient = new PermaShipClient(TEST_CONFIG);
  const callbackService = new CallbackService(store, paperclipClient);
  const invokeService = new InvokeService(
    TEST_CONFIG,
    store,
    permashipClient,
    callbackService
  );

  const app = express();
  app.use(express.json());
  app.use("/invoke", createInvokeRouter(invokeService, apiKey));

  return { app, store, invokeService, tmpFile };
}

describe("POST /invoke", () => {
  it("returns 400 for empty body", async () => {
    const { app } = createTestApp();
    const res = await request(app).post("/invoke").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid payload");
  });

  it("returns 400 for missing runId", async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post("/invoke")
      .send({ agentId: "test-agent" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid payload");
    expect(res.body.details).toBeDefined();
  });

  it("returns 400 for empty runId", async () => {
    const { app } = createTestApp();
    const res = await request(app).post("/invoke").send({ runId: "" });
    expect(res.status).toBe(400);
  });

  it("returns 202 for valid minimal payload", async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post("/invoke")
      .send({ runId: "run-123" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("accepted");
    expect(res.body.runId).toBe("run-123");
  });

  it("returns 202 for valid full payload", async () => {
    const { app } = createTestApp();
    const res = await request(app).post("/invoke").send({
      runId: "run-456",
      agentId: "agent-1",
      taskId: "task-1",
      wakeReason: "timer",
      issueIds: ["issue-1", "issue-2"],
      context: { key: "value" },
    });
    expect(res.status).toBe(202);
    expect(res.body.runId).toBe("run-456");
  });

  it("creates a mapping in the store on valid invoke", async () => {
    const { app, store } = createTestApp();
    await request(app).post("/invoke").send({ runId: "run-789" });
    // Give async processing a moment
    await new Promise((r) => setTimeout(r, 200));
    const mapping = store.getByRunId("run-789");
    expect(mapping).toBeDefined();
    expect(mapping?.paperclipRunId).toBe("run-789");
    // Status may be "pending" or "create_failed" depending on async processing
    expect(["pending", "create_failed"]).toContain(mapping?.status);
    expect(mapping?.retryCount).toBeTypeOf("number");
  });
});

describe("POST /invoke auth", () => {
  it("returns 401 when auth token is missing and PAPERCLIP_API_KEY is set", async () => {
    const { app } = createTestApp("secret-api-key");
    const res = await request(app)
      .post("/invoke")
      .send({ runId: "run-auth-1" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 202 when valid auth token is provided", async () => {
    const { app } = createTestApp("secret-api-key");
    const res = await request(app)
      .post("/invoke")
      .set("Authorization", "Bearer secret-api-key")
      .send({ runId: "run-auth-2" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("accepted");
    expect(res.body.runId).toBe("run-auth-2");
  });
});

describe("InvokeService.processInvoke error paths", () => {
  it("sets status to create_failed when PermaShip ticket creation fails", async () => {
    const tmpFile = path.join(os.tmpdir(), `bridge-err-${Date.now()}.json`);
    const store = new MappingStore(tmpFile);
    const paperclipClient = new PaperclipClient(TEST_CONFIG);
    const permashipClient = new PermaShipClient(TEST_CONFIG);
    const callbackService = new CallbackService(store, paperclipClient);
    const invokeService = new InvokeService(
      TEST_CONFIG,
      store,
      permashipClient,
      callbackService
    );

    // Mock permaship client to throw
    vi.spyOn(permashipClient, "createTicket").mockRejectedValue(
      new Error("Connection refused")
    );
    // Mock callback to not actually call Paperclip
    vi.spyOn(paperclipClient, "sendCallback").mockResolvedValue();

    await invokeService.processInvoke({
      runId: "run-fail-1",
      taskId: "task-1",
    });

    const mapping = store.getByRunId("run-fail-1");
    expect(mapping).toBeDefined();
    expect(mapping?.status).toBe("create_failed");
  });

  it("sends failure callback to Paperclip when ticket creation fails", async () => {
    const tmpFile = path.join(os.tmpdir(), `bridge-cb-${Date.now()}.json`);
    const store = new MappingStore(tmpFile);
    const paperclipClient = new PaperclipClient(TEST_CONFIG);
    const permashipClient = new PermaShipClient(TEST_CONFIG);
    const callbackService = new CallbackService(store, paperclipClient);
    const invokeService = new InvokeService(
      TEST_CONFIG,
      store,
      permashipClient,
      callbackService
    );

    vi.spyOn(permashipClient, "createTicket").mockRejectedValue(
      new Error("timeout")
    );
    const sendSpy = vi
      .spyOn(paperclipClient, "sendCallback")
      .mockResolvedValue();

    await invokeService.processInvoke({ runId: "run-fail-2" });

    expect(sendSpy).toHaveBeenCalledWith("run-fail-2", {
      status: "failed",
      result: "Bridge failed to create PermaShip ticket.",
      errorMessage: "timeout",
    });
  });

  it("queues retry when callback also fails", async () => {
    const tmpFile = path.join(os.tmpdir(), `bridge-retry-${Date.now()}.json`);
    const store = new MappingStore(tmpFile);
    const paperclipClient = new PaperclipClient(TEST_CONFIG);
    const permashipClient = new PermaShipClient(TEST_CONFIG);
    const callbackService = new CallbackService(store, paperclipClient);
    const invokeService = new InvokeService(
      TEST_CONFIG,
      store,
      permashipClient,
      callbackService
    );

    vi.spyOn(permashipClient, "createTicket").mockRejectedValue(
      new Error("permaship down")
    );
    vi.spyOn(paperclipClient, "sendCallback").mockRejectedValue(
      new Error("paperclip also down")
    );

    await invokeService.processInvoke({ runId: "run-fail-3" });

    const mapping = store.getByRunId("run-fail-3");
    expect(mapping).toBeDefined();
    expect(mapping?.retryCount).toBe(1);
    expect(mapping?.nextRetryAt).not.toBeNull();
    expect(mapping?.retryExhausted).toBe(false);
  });
});
