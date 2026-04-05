import { z } from "zod";

/**
 * PermaShip ticket creation request.
 * Based on POST /orgs/:orgId/projects/:projectId/tickets
 */
export interface PermaShipTicketRequest {
  kind: string;
  title: string;
  description: string;
  repoKey: string;
  priority: number;
  labels: string[];
}

/**
 * PermaShip ticket creation response (assumed shape).
 * The actual API may return more fields; we capture what we need.
 */
export interface PermaShipTicketResponse {
  id: string;
  status: string;
  [key: string]: unknown;
}

/**
 * PermaShip webhook event payload.
 * We validate the minimum fields and pass through the rest.
 */
export const PermaShipWebhookSchema = z.object({
  event: z.string().min(1),
  ticketId: z.string().min(1),
  projectId: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});

export type PermaShipWebhookPayload = z.infer<typeof PermaShipWebhookSchema>;
