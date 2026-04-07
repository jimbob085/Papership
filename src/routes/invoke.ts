import { Router, type Request, type Response } from "express";
import { PaperclipInvokeSchema } from "../types/paperclip";
import { InvokeService } from "../services/invokeService";
import { logger } from "../lib/logger";

export function createInvokeRouter(
  invokeService: InvokeService,
  apiKey?: string
): Router {
  const router = Router();

  router.post("/", (req: Request, res: Response) => {
    // Bearer token auth check (skipped when no API key is configured)
    if (apiKey) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : undefined;

      if (token !== apiKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const parsed = PaperclipInvokeSchema.safeParse(req.body);

    if (!parsed.success) {
      logger.warn("Invalid invoke payload", {
        errors: parsed.error.flatten().fieldErrors,
      });
      res.status(400).json({
        error: "Invalid payload",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const payload = parsed.data;

    logger.info("Invoke received", { paperclipRunId: payload.runId });

    // Return 202 immediately
    res.status(202).json({
      status: "accepted",
      runId: payload.runId,
    });

    // Process asynchronously
    invokeService.processInvoke(payload).catch((err) => {
      logger.error("Unhandled invoke processing error", {
        paperclipRunId: payload.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  return router;
}
