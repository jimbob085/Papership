import { describe, it, expect } from "vitest";
import { translateEvent } from "../src/services/webhookService";

describe("translateEvent", () => {
  it("translates ready_for_review to succeeded callback", () => {
    const result = translateEvent("ready_for_review");

    expect(result).not.toBeNull();
    expect(result!.status).toBe("succeeded");
    expect(result!.result).toBe(
      "PermaShip completed the engineering task and marked it ready for review."
    );
    expect(result!.errorMessage).toBeNull();
  });

  it("translates ticket.failed to failed callback", () => {
    const result = translateEvent("ticket.failed");

    expect(result).not.toBeNull();
    expect(result!.status).toBe("failed");
    expect(result!.errorMessage).toBe(
      "PermaShip failed while executing the engineering task."
    );
  });

  it("includes error detail from data when available", () => {
    const result = translateEvent("ticket.failed", {
      errorMessage: "Build broke on step 3",
    });

    expect(result).not.toBeNull();
    expect(result!.errorMessage).toBe("Build broke on step 3");
  });

  it("returns null for unrecognized events", () => {
    const result = translateEvent("ticket.in_progress");

    expect(result).toBeNull();
  });

  it("returns null for empty event string edge case", () => {
    const result = translateEvent("some_random_event", { data: "whatever" });

    expect(result).toBeNull();
  });
});
