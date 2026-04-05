import { z } from "zod";

/**
 * Paperclip HTTP adapter invoke payload.
 * We validate the minimum required fields and pass through the rest.
 */
export const PaperclipInvokeSchema = z.object({
  runId: z.string().min(1),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  wakeReason: z.string().optional(),
  issueIds: z.array(z.string()).optional(),
  approvalStatus: z.string().optional(),
  context: z.unknown().optional(),
});

export type PaperclipInvokePayload = z.infer<typeof PaperclipInvokeSchema>;

/**
 * Paperclip callback payload sent to /api/heartbeat-runs/:runId/callback
 */
export interface PaperclipCallbackPayload {
  status: "succeeded" | "failed";
  result: string;
  errorMessage: string | null;
  usage?: { inputTokens?: number; outputTokens?: number };
  costUsd?: number;
  model?: string;
  provider?: string;
}
