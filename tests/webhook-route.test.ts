import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request } from "express";
import { createWebhookRouter } from "../src/routes/permashipWebhook";
import type { WebhookService } from "../src/services/webhookService";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function buildApp(webhookSecret: string) {
  const app = express();

  // Mirror the raw body capture from app.ts
  app.use(
    express.json({
      verify: (req: Request, _res, buf) => {
        req.rawBody = buf.toString("utf-8");
      },
    })
  );

  const mockWebhookService = {
    handleEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as WebhookService;

  app.use(
    "/webhooks/permaship",
    createWebhookRouter(mockWebhookService, webhookSecret)
  );

  return { app, mockWebhookService };
}

const payload = { event: "ready_for_review", ticketId: "T-100" };

describe("POST /webhooks/permaship (with secret configured)", () => {
  const secret = "my-secret";

  it("accepts request with valid X-Permaship-Signature", async () => {
    const { app } = buildApp(secret);
    const body = JSON.stringify(payload);
    const sig = sign(body, secret);

    const res = await request(app)
      .post("/webhooks/permaship")
      .set("Content-Type", "application/json")
      .set("X-Permaship-Signature", sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("accepts request with valid X-Webhook-Signature (legacy header)", async () => {
    const { app } = buildApp(secret);
    const body = JSON.stringify(payload);
    const sig = sign(body, secret);

    const res = await request(app)
      .post("/webhooks/permaship")
      .set("Content-Type", "application/json")
      .set("X-Webhook-Signature", sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("returns 401 for invalid signature", async () => {
    const { app } = buildApp(secret);
    const body = JSON.stringify(payload);
    const badSig = sign("wrong body", secret);

    const res = await request(app)
      .post("/webhooks/permaship")
      .set("Content-Type", "application/json")
      .set("X-Permaship-Signature", badSig)
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid signature" });
  });

  it("returns 401 when signature header is missing", async () => {
    const { app } = buildApp(secret);
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post("/webhooks/permaship")
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid signature" });
  });
});

describe("POST /webhooks/permaship (without secret configured)", () => {
  it("passes through with warning when no secret is set", async () => {
    const { app } = buildApp("");
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post("/webhooks/permaship")
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
