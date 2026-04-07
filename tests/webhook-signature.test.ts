import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyWebhookSignature } from "../src/lib/signature";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyWebhookSignature", () => {
  const secret = "test-webhook-secret-key";
  const body = JSON.stringify({ event: "ready_for_review", ticketId: "T-42" });

  it("returns true for a valid HMAC-SHA256 signature", () => {
    const sig = sign(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const badSig = sign("tampered body", secret);
    expect(verifyWebhookSignature(body, badSig, secret)).toBe(false);
  });

  it("returns false when signature is missing but secret is configured", () => {
    expect(verifyWebhookSignature(body, "", secret)).toBe(false);
  });

  it("returns true (passthrough) when secret is not configured", () => {
    expect(verifyWebhookSignature(body, "", "")).toBe(true);
  });

  it("returns false for a signature with wrong length", () => {
    expect(verifyWebhookSignature(body, "abcd", secret)).toBe(false);
  });
});
