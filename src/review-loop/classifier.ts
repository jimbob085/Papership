import type { StructuredCapabilities } from "./capabilities-schema";

export type ReviewDomain = 'security' | 'reliability' | 'quality' | 'cost' | 'ux' | 'general';

function classifyFromStructured(
  issueTitle: string,
  resultSummary: string | undefined,
  capabilities: StructuredCapabilities
): ReviewDomain {
  const text = `${issueTitle} ${resultSummary ?? ''}`.toLowerCase();

  let bestDomain: ReviewDomain = 'general';
  let bestScore = 0;

  for (const cap of capabilities.capabilities) {
    let score = 0;
    for (const kw of cap.keywords) {
      if (text.includes(kw.toLowerCase())) score += 1;
    }
    // Weight by priority
    score *= cap.priority;

    if (score > bestScore) {
      bestScore = score;
      bestDomain = cap.domain;
    }
  }

  return bestDomain;
}

function classifyFromKeywords(
  issueTitle: string,
  agentCapabilities: string,
  resultSummary?: string
): ReviewDomain {
  const text = `${issueTitle} ${agentCapabilities} ${resultSummary ?? ''}`.toLowerCase();

  if (/auth|secret|vuln|cve|injection|xss|csrf|permission|access.control|credential/.test(text)) return 'security';
  if (/latency|timeout|circuit|retry|uptime|slo|alert|monitor|infra|memory|cpu|queue/.test(text)) return 'reliability';
  if (/test|coverage|regression|bug|flak|assert|spec|qa/.test(text)) return 'quality';
  if (/cost|spend|billing|token|budget|resource|optimize/.test(text)) return 'cost';
  if (/ui|ux|design|accessibility|layout|user.flow|onboard/.test(text)) return 'ux';
  return 'general';
}

export function classifyRun(params: {
  issueTitle: string;
  agentCapabilities: string;
  resultSummary?: string;
  structuredCapabilities?: StructuredCapabilities;
}): ReviewDomain {
  if (params.structuredCapabilities?.version === 1) {
    return classifyFromStructured(params.issueTitle, params.resultSummary, params.structuredCapabilities);
  }
  return classifyFromKeywords(params.issueTitle, params.agentCapabilities, params.resultSummary);
}
