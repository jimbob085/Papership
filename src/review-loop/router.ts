import type { ReviewDomain } from "./classifier";

const DOMAIN_TO_AGENT: Record<ReviewDomain, string> = {
  security: 'CISO',
  reliability: 'SRE',
  quality: 'QA Manager',
  cost: 'FinOps',
  ux: 'UX Designer',
  general: 'Nexus',
};

export function routeToAgent(domain: ReviewDomain): string {
  return DOMAIN_TO_AGENT[domain];
}
