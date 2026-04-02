/**
 * Nexus Governance Plugin for Paperclip
 *
 * Adds AI-powered governance review to Paperclip agent workflows.
 * When an issue is created or assigned, Nexus's specialist agents
 * (Security, QA, SRE, Product, Design) review the work before execution.
 */
export default {
  id: 'permaship.nexus-governance',
  version: '0.1.0',
  name: 'Nexus Governance',
  description:
    'AI governance layer that reviews agent work through specialist agents (Security, QA, SRE, Product) before execution. Powered by Nexus from Permaship.ai.',
  author: 'PermaShip AI',
  capabilities: [
    'events.subscribe',
    'issues.create',
    'issues.update',
    'issues.listComments',
    'agents.list',
    'state.get',
    'state.set',
    'http.request',
    'log',
    'metrics.write',
  ],
  worker: './dist/worker.js',
  uiSlots: [
    {
      type: 'dashboardWidget',
      slotId: 'nexus-governance-overview',
      exportName: 'NexusGovernanceWidget',
      label: 'Nexus Governance',
    },
  ],
};
