import type { PaperclipInvokePayload } from "../types/paperclip";
import type { PermaShipTicketRequest } from "../types/permaship";

interface MapperOptions {
  repoKey: string;
  defaultKind: string;
  defaultPriority: number;
}

/**
 * Maps a Paperclip invoke payload to a PermaShip ticket creation request.
 */
export function mapToPermaShipTicket(
  payload: PaperclipInvokePayload,
  options: MapperOptions
): PermaShipTicketRequest {
  const title = deriveTitle(payload);
  const description = buildDescription(payload);

  return {
    kind: options.defaultKind,
    title,
    description,
    repoKey: options.repoKey,
    priority: options.defaultPriority,
    labels: buildLabels(payload),
  };
}

function deriveTitle(payload: PaperclipInvokePayload): string {
  // If context contains a title-like field, use it
  if (payload.context && typeof payload.context === "object") {
    const ctx = payload.context as Record<string, unknown>;
    if (typeof ctx.title === "string" && ctx.title.length > 0) {
      return ctx.title;
    }
    if (typeof ctx.summary === "string" && ctx.summary.length > 0) {
      return ctx.summary;
    }
  }

  // Fall back to a generated title
  const parts = ["Paperclip task"];
  if (payload.taskId) parts.push(payload.taskId);
  if (payload.wakeReason) parts.push(`(${payload.wakeReason})`);
  return parts.join(" ");
}

function buildDescription(payload: PaperclipInvokePayload): string {
  const lines: string[] = [
    "Task delegated from Paperclip via bridge.",
    "",
    `Run ID: ${payload.runId}`,
  ];

  if (payload.agentId) lines.push(`Agent ID: ${payload.agentId}`);
  if (payload.taskId) lines.push(`Task ID: ${payload.taskId}`);
  if (payload.wakeReason) lines.push(`Wake Reason: ${payload.wakeReason}`);

  if (payload.issueIds && payload.issueIds.length > 0) {
    lines.push(`Related Issues: ${payload.issueIds.join(", ")}`);
  }

  if (payload.context) {
    lines.push("", "--- Context ---", JSON.stringify(payload.context, null, 2));
  }

  return lines.join("\n");
}

function buildLabels(payload: PaperclipInvokePayload): string[] {
  const labels = ["paperclip", "bridge"];
  if (payload.wakeReason) {
    labels.push(payload.wakeReason.toLowerCase().replace(/\s+/g, "-"));
  }
  return labels;
}
