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
  const webhookService = new WebhookService(mappingStore, callbackService);

  // Mount routes
  app.use("/invoke", createInvokeRouter(invokeService));
  app.use("/webhooks/permaship", createWebhookRouter(webhookService, config.permaship.webhookSecret));
  app.use("/health", createHealthRouter());

  return { app, mappingStore };
}
