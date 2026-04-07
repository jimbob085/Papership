import type { StructuredCapabilities } from "./capabilities-schema";

export const AGENT_CAPABILITIES: Record<string, StructuredCapabilities> = {
  ciso: {
    version: 1,
    capabilities: [{
      domain: 'security',
      keywords: ['auth', 'secret', 'vuln', 'cve', 'injection', 'xss', 'csrf', 'permission', 'credential', 'access control', 'security', 'remediat'],
      priority: 10,
      handles: ['security review', 'vulnerability triage', 'auth changes', 'secrets management'],
    }],
  },
  sre: {
    version: 1,
    capabilities: [{
      domain: 'reliability',
      keywords: ['latency', 'timeout', 'circuit', 'retry', 'uptime', 'slo', 'alert', 'monitor', 'queue', 'memory', 'cpu'],
      priority: 9,
      handles: ['performance review', 'infrastructure changes', 'SLO impact', 'observability'],
    }],
  },
  'qa-manager': {
    version: 1,
    capabilities: [{
      domain: 'quality',
      keywords: ['test', 'coverage', 'regression', 'bug', 'flak', 'assert', 'spec', 'qa'],
      priority: 8,
      handles: ['test coverage review', 'regression analysis', 'quality gates'],
    }],
  },
  finops: {
    version: 1,
    capabilities: [{
      domain: 'cost',
      keywords: ['cost', 'spend', 'billing', 'token', 'budget', 'resource', 'optimize'],
      priority: 7,
      handles: ['cost review', 'token budget analysis', 'resource efficiency'],
    }],
  },
  'ux-designer': {
    version: 1,
    capabilities: [{
      domain: 'ux',
      keywords: ['ui', 'ux', 'design', 'accessibility', 'layout', 'user flow', 'onboard', 'microcopy'],
      priority: 7,
      handles: ['UX review', 'workflow clarity', 'accessibility audit'],
    }],
  },
  agentops: {
    version: 1,
    capabilities: [{
      domain: 'general',
      keywords: ['agent', 'heartbeat', 'pipeline', 'prompt', 'session', 'adapter', 'config'],
      priority: 6,
      handles: ['agent health review', 'pipeline quality', 'prompt regression'],
    }],
  },
  'product-manager': {
    version: 1,
    capabilities: [{
      domain: 'general',
      keywords: ['roadmap', 'prd', 'feature', 'scope', 'acceptance', 'priority', 'milestone'],
      priority: 5,
      handles: ['proposal triage', 'scope review', 'roadmap alignment'],
    }],
  },
  voc: {
    version: 1,
    capabilities: [{
      domain: 'general',
      keywords: ['feedback', 'support', 'user', 'onboarding', 'friction', 'confusion', 'documentation'],
      priority: 4,
      handles: ['feedback synthesis', 'user friction analysis', 'documentation gaps'],
    }],
  },
};
