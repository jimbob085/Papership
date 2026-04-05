import crypto from "node:crypto";

/**
 * Verify a PermaShip webhook signature.
 *
 * PermaShip documents X-Webhook-Signature for webhook verification.
 * Assumption: HMAC-SHA256 hex digest of the raw body using the webhook secret.
 * If the actual algorithm differs, update this function accordingly.
 *
 * TODO: Confirm exact signature format with PermaShip docs when available.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) {
    // No secret configured; skip verification in development
    return true;
  }

  if (!signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}
