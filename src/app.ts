import express, { type Request } from "express";
import type { AppConfig } from "./config";
import { MappingStore } from "./store/mappingStore";
import { PermaShipClient } from "./clients/permashipClient";
import { PaperclipClient } from "./clients/paperclipClient";
import { InvokeService } from "./services/invokeService";
import { CallbackService } from "./services/callbackService";
import { WebhookService } from "./services/webhookService";
import { createInvokeRouter } from "./routes/invoke";
import { createWebhookRouter } from "./routes/permashipWebhook";
import { createHealthRouter } from "./routes/health";
import { RetryScheduler } from "./services/retryScheduler";
import { StallDetector } from "./services/stallDetector";
import { startReviewLoop } from "./review-loop/index";

export function createApp(config: AppConfig, store?: MappingStore) {
  const app = express();

  // Parse JSON and capture raw body for webhook signature verification
  app.use(
    express.json({
      limit: "1mb",
      verify: (req: Request, _res, buf) => {
        req.rawBody = buf.toString("utf-8");
      },
    })
  );

  // Initialize dependencies
  const mappingStore = store || new MappingStore();
  const permashipClient = new PermaShipClient(config);
  const paperclipClient = new PaperclipClient(config);

  const callbackService = new CallbackService(mappingStore, paperclipClient);
  const invokeService = new InvokeService(config, mappingStore, permashipClient, callbackService);
  const webhookService = new WebhookService(mappingStore, callbackService, paperclipClient);

  // Mount routes
  app.use("/invoke", createInvokeRouter(invokeService, config.paperclip.apiKey));
  app.use("/webhooks/permaship", createWebhookRouter(webhookService, config.permaship.webhookSecret));
  app.use("/health", createHealthRouter());

  // Start retry scheduler for failed callbacks
  const retryScheduler = new RetryScheduler(mappingStore, callbackService);
  retryScheduler.start();

  // Start stall detector for stuck heartbeat runs
  const stallDetector = new StallDetector(mappingStore, paperclipClient);
  stallDetector.start();

  // Start review loop for post-execution governance reviews
  const reviewLoop = startReviewLoop(config, mappingStore);

  return { app, mappingStore, retryScheduler, stallDetector, reviewLoop };
}
