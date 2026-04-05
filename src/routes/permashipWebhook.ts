import { Router, type Request, type Response } from "express";
import { PermaShipWebhookSchema } from "../types/permaship";
import { verifyWebhookSignature } from "../lib/signature";
import { WebhookService } from "../services/webhookService";
import { logger } from "../lib/logger";

export function createWebhookRouter(
  webhookService: WebhookService,
  webhookSecret: string
): Router {
  const router = Router();

  router.post("/", (req: Request, res: Response) => {
    // Verify signature
    const signature = req.headers["x-webhook-signature"] as string | undefined;
    const rawBody = JSON.stringify(req.body);

    if (webhookSecret && !verifyWebhookSignature(rawBody, signature || "", webhookSecret)) {
      logger.warn("Webhook signature verification failed");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    // Validate payload
    const parsed = PermaShipWebhookSchema.safeParse(req.body);

    if (!parsed.success) {
      logger.warn("Invalid webhook payload", {
        errors: parsed.error.flatten().fieldErrors,
      });
      res.status(400).json({
        error: "Invalid payload",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    // Always return 200 for valid payloads
    res.status(200).json({ received: true });

    // Process asynchronously
    webhookService.handleEvent(parsed.data).catch((err) => {
      logger.error("Unhandled webhook processing error", {
        permashipTicketId: parsed.data.ticketId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  return router;
}
