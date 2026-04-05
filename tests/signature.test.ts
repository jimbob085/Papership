import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature } from "../src/lib/signature";

describe("verifyWebhookSignature", () => {
  const secret = "test_secret_123";

  it("returns true for a valid signature", () => {
    const body = '{"event":"ready_for_review","ticketId":"tkt_1"}';
    const signature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const body = '{"event":"ready_for_review","ticketId":"tkt_1"}';
    const badSignature = crypto
      .createHmac("sha256", "wrong_secret")
      .update(body)
      .digest("hex");

    expect(verifyWebhookSignature(body, badSignature, secret)).toBe(false);
  });

  it("returns false when no signature is provided", () => {
    const body = '{"event":"test"}';
    expect(verifyWebhookSignature(body, "", secret)).toBe(false);
  });

  it("skips verification when no secret is configured", () => {
    const body = '{"event":"test"}';
    expect(verifyWebhookSignature(body, "", "")).toBe(true);
  });
});
