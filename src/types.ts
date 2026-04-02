/**
 * Types shared between the plugin worker and Nexus API client.
 */

/** Nexus specialist agent identifiers */
export type NexusSpecialist =
  | 'ciso'
  | 'qa-manager'
  | 'sre'
  | 'ux-designer'
  | 'product-manager'
  | 'release-engineering'
  | 'finops'
  | 'voc';

/** A single specialist's review verdict */
export interface SpecialistVerdict {
  specialist: NexusSpecialist;
  decision: 'approve' | 'flag' | 'block';
  reasoning: string;
  severity: 'info' | 'warning' | 'critical';
  suggestions?: string[];
}

/** The consolidated governance review result */
export interface GovernanceReview {
  issueId: string;
  issueTitle: string;
  decision: 'approved' | 'needs-revision' | 'blocked';
  verdicts: SpecialistVerdict[];
  summary: string;
  reviewedAt: string;
  reviewDurationMs: number;
}

/** Configuration for the Nexus connection */
export interface NexusConfig {
  /** Base URL of the Nexus API (e.g., http://localhost:9000) */
  nexusUrl: string;
  /** Shared secret for authenticating with Nexus internal API */
  internalSecret: string;
  /** Which specialists to include in reviews (defaults to all) */
  activeSpecialists?: NexusSpecialist[];
  /** Auto-approve if all specialists approve (skip human gate) */
  autoApproveOnConsensus?: boolean;
  /** Timeout in ms for a single review cycle (default: 120000) */
  reviewTimeoutMs?: number;
}

/** Paperclip issue data passed to the review pipeline */
export interface ReviewRequest {
  issueId: string;
  issueTitle: string;
  issueBody: string;
  assigneeAgent?: string;
  goalId?: string;
  companyId: string;
  metadata?: Record<string, unknown>;
}

/** Status of a governance review in plugin state */
export interface ReviewState {
  issueId: string;
  status: 'pending' | 'in-review' | 'completed' | 'error';
  review?: GovernanceReview;
  error?: string;
  startedAt: string;
  completedAt?: string;
}
