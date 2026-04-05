import { describe, it, expect } from "vitest";
import { mapToPermaShipTicket } from "../src/lib/mapper";
import type { PaperclipInvokePayload } from "../src/types/paperclip";

const defaultOptions = {
  repoKey: "acme/backend",
  defaultKind: "feature",
  defaultPriority: 2,
};

describe("mapToPermaShipTicket", () => {
  it("maps a full payload with context title", () => {
    const payload: PaperclipInvokePayload = {
      runId: "run_abc123",
      agentId: "agent_eng_01",
      taskId: "task_456",
      wakeReason: "new_issue",
      issueIds: ["ISS-101"],
      context: {
        title: "Add rate limiting to /api/users endpoint",
      },
    };

    const ticket = mapToPermaShipTicket(payload, defaultOptions);

    expect(ticket.title).toBe("Add rate limiting to /api/users endpoint");
    expect(ticket.kind).toBe("feature");
    expect(ticket.repoKey).toBe("acme/backend");
    expect(ticket.priority).toBe(2);
    expect(ticket.labels).toContain("paperclip");
    expect(ticket.labels).toContain("bridge");
    expect(ticket.labels).toContain("new_issue");
    expect(ticket.description).toContain("run_abc123");
    expect(ticket.description).toContain("agent_eng_01");
    expect(ticket.description).toContain("ISS-101");
  });

  it("generates a fallback title when context has no title", () => {
    const payload: PaperclipInvokePayload = {
      runId: "run_minimal",
      taskId: "task_789",
      wakeReason: "scheduled",
    };

    const ticket = mapToPermaShipTicket(payload, defaultOptions);

    expect(ticket.title).toBe("Paperclip task task_789 (scheduled)");
  });

  it("generates a minimal title with no taskId or wakeReason", () => {
    const payload: PaperclipInvokePayload = {
      runId: "run_bare",
    };

    const ticket = mapToPermaShipTicket(payload, defaultOptions);

    expect(ticket.title).toBe("Paperclip task");
    expect(ticket.labels).toEqual(["paperclip", "bridge"]);
  });

  it("uses context.summary as title fallback", () => {
    const payload: PaperclipInvokePayload = {
      runId: "run_summary",
      context: {
        summary: "Fix the login timeout bug",
      },
    };

    const ticket = mapToPermaShipTicket(payload, defaultOptions);

    expect(ticket.title).toBe("Fix the login timeout bug");
  });

  it("includes full context in description", () => {
    const payload: PaperclipInvokePayload = {
      runId: "run_ctx",
      context: { foo: "bar", nested: { a: 1 } },
    };

    const ticket = mapToPermaShipTicket(payload, defaultOptions);

    expect(ticket.description).toContain("--- Context ---");
    expect(ticket.description).toContain('"foo": "bar"');
  });
});
