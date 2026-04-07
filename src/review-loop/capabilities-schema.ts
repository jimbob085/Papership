import type { ReviewDomain } from "./classifier";

export interface AgentCapability {
  domain: ReviewDomain;
  keywords: string[];
  priority: number;
  handles: string[];
}

export interface StructuredCapabilities {
  version: 1;
  capabilities: AgentCapability[];
}
