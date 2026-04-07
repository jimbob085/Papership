import { describe, it, expect } from "vitest";
import { classifyRun, type ReviewDomain } from "../src/review-loop/classifier";
import { routeToAgent } from "../src/review-loop/router";
import { AGENT_CAPABILITIES } from "../src/review-loop/agent-capabilities";
import { isNullRun } from "../src/review-loop/index";

describe("classifyRun", () => {
  it("classifies security-related runs", () => {
    expect(classifyRun({ issueTitle: "Fix authentication bypass", agentCapabilities: "" })).toBe("security");
    expect(classifyRun({ issueTitle: "Update credentials", agentCapabilities: "" })).toBe("security");
    expect(classifyRun({ issueTitle: "Patch XSS vulnerability", agentCapabilities: "" })).toBe("security");
  });

  it("classifies reliability-related runs", () => {
    expect(classifyRun({ issueTitle: "Add circuit breaker", agentCapabilities: "" })).toBe("reliability");
    expect(classifyRun({ issueTitle: "Fix timeout on API", agentCapabilities: "" })).toBe("reliability");
    expect(classifyRun({ issueTitle: "Set up SLO alerting", agentCapabilities: "" })).toBe("reliability");
  });

  it("classifies quality-related runs", () => {
    expect(classifyRun({ issueTitle: "Add test coverage", agentCapabilities: "" })).toBe("quality");
    expect(classifyRun({ issueTitle: "Fix regression in parser", agentCapabilities: "" })).toBe("quality");
  });

  it("classifies cost-related runs", () => {
    expect(classifyRun({ issueTitle: "Optimize token spending", agentCapabilities: "" })).toBe("cost");
    expect(classifyRun({ issueTitle: "Review billing integration", agentCapabilities: "" })).toBe("cost");
  });

  it("classifies UX-related runs", () => {
    expect(classifyRun({ issueTitle: "Improve onboarding flow", agentCapabilities: "" })).toBe("ux");
    expect(classifyRun({ issueTitle: "Fix accessibility issues", agentCapabilities: "" })).toBe("ux");
  });

  it("defaults to general for unclassified runs", () => {
    expect(classifyRun({ issueTitle: "Update README", agentCapabilities: "" })).toBe("general");
    expect(classifyRun({ issueTitle: "Refactor config loader", agentCapabilities: "" })).toBe("general");
  });

  it("considers agent capabilities in classification", () => {
    expect(classifyRun({
      issueTitle: "Investigate issue",
      agentCapabilities: "Security architecture, threat modeling, vulnerability assessment",
    })).toBe("security");
  });

  it("considers result summary in classification", () => {
    expect(classifyRun({
      issueTitle: "General task",
      agentCapabilities: "",
      resultSummary: "Added retry logic with exponential backoff for queue processing",
    })).toBe("reliability");
  });
});

describe("classifyRun with structured capabilities", () => {
  it("uses structured capabilities when provided", () => {
    expect(classifyRun({
      issueTitle: "Fix authentication bypass",
      agentCapabilities: "",
      structuredCapabilities: AGENT_CAPABILITIES.ciso,
    })).toBe("security");
  });

  it("matches SRE capabilities for reliability work", () => {
    expect(classifyRun({
      issueTitle: "Add circuit breaker to API",
      agentCapabilities: "",
      structuredCapabilities: AGENT_CAPABILITIES.sre,
    })).toBe("reliability");
  });

  it("falls back to general when no keywords match", () => {
    expect(classifyRun({
      issueTitle: "Update the README",
      agentCapabilities: "",
      structuredCapabilities: AGENT_CAPABILITIES.ciso,
    })).toBe("general");
  });

  it("falls back to keyword scan when no structured capabilities", () => {
    expect(classifyRun({
      issueTitle: "Fix XSS vulnerability",
      agentCapabilities: "",
    })).toBe("security");
  });

  it("prefers structured capabilities over keyword scan", () => {
    // This title matches "test" (quality) by keyword, but structured capabilities say reliability
    expect(classifyRun({
      issueTitle: "Test the retry timeout behavior",
      agentCapabilities: "",
      structuredCapabilities: AGENT_CAPABILITIES.sre,
    })).toBe("reliability");
  });

  it("routes test coverage task to QA Manager via structured capabilities", () => {
    expect(classifyRun({
      issueTitle: "Write tests for the 3 critical untested modules",
      agentCapabilities: "",
      structuredCapabilities: AGENT_CAPABILITIES['qa-manager'],
    })).toBe("quality");
  });

  it("routes security remediation task to CISO via structured capabilities", () => {
    expect(classifyRun({
      issueTitle: "Remediate critical security findings",
      agentCapabilities: "",
      structuredCapabilities: AGENT_CAPABILITIES.ciso,
    })).toBe("security");
  });
});

describe("routeToAgent", () => {
  const expectedMappings: Array<[ReviewDomain, string]> = [
    ["security", "CISO"],
    ["reliability", "SRE"],
    ["quality", "QA Manager"],
    ["cost", "FinOps"],
    ["ux", "UX Designer"],
    ["general", "Nexus"],
  ];

  for (const [domain, agent] of expectedMappings) {
    it(`routes ${domain} to ${agent}`, () => {
      expect(routeToAgent(domain)).toBe(agent);
    });
  }
});

describe("isNullRun filter", () => {
  it("filters runs with 'no assignments' in result", () => {
    expect(isNullRun("No assignments. Scheduled heartbeat, no pending work. Exiting.")).toBe(true);
  });

  it("filters null/empty results", () => {
    expect(isNullRun(null)).toBe(true);
    expect(isNullRun("")).toBe(true);
    expect(isNullRun(undefined)).toBe(true);
  });

  it("does not filter substantive output", () => {
    expect(isNullRun("Fixed authentication bypass in login handler. Added CSRF token validation.")).toBe(false);
  });
});
