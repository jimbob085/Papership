/**
 * Nexus Governance Plugin for Paperclip
 *
 * Entry point. Exports the plugin manifest and re-exports types
 * for consumers who want to interact with the plugin programmatically.
 */

export { default as manifest } from './manifest.js';
export type {
  GovernanceReview,
  SpecialistVerdict,
  NexusConfig,
  NexusSpecialist,
  ReviewRequest,
  ReviewState,
} from './types.js';
