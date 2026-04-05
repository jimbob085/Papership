import type { AppConfig } from "../config";
import type { PermaShipTicketRequest, PermaShipTicketResponse } from "../types/permaship";
import { logger } from "../lib/logger";

export class PermaShipClient {
  private baseUrl: string;
  private apiKey: string;
  private orgId: string;
  private projectId: string;

  constructor(config: AppConfig) {
    this.baseUrl = config.permaship.baseUrl.replace(/\/$/, "");
    this.apiKey = config.permaship.apiKey;
    this.orgId = config.permaship.orgId;
    this.projectId = config.permaship.projectId;
  }

  async createTicket(
    ticket: PermaShipTicketRequest,
    paperclipRunId: string
  ): Promise<PermaShipTicketResponse> {
    const url = `${this.baseUrl}/orgs/${this.orgId}/projects/${this.projectId}/tickets`;

    logger.info("PermaShip ticket create requested", {
      paperclipRunId,
      url,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(ticket),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("PermaShip ticket create failed", {
        paperclipRunId,
        statusCode: response.status,
        body,
      });
      throw new Error(`PermaShip API error: ${response.status} ${body}`);
    }

    const data = (await response.json()) as PermaShipTicketResponse;

    logger.info("PermaShip ticket create succeeded", {
      paperclipRunId,
      permashipTicketId: data.id,
    });

    return data;
  }
}
