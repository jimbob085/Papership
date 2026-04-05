import { Router, type Request, type Response } from "express";

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      service: "paperclip-permaship-bridge",
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
