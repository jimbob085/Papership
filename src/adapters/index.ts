import { PaperclipTicketTracker } from './ticket-tracker.js';
import { PaperclipProjectRegistry } from './project-registry.js';
import { PaperclipTenantResolver } from './tenant-resolver.js';
import { AnthropicLLMProvider } from './llm-provider.js';
import {
  ConsoleUsageSink,
  NoopCommitProvider,
  EmptyKnowledgeSource,
  ConsoleCommunicationAdapter,
} from './stubs.js';
import type { AdapterSet } from './types.js';

export { PaperclipTicketTracker } from './ticket-tracker.js';
export { PaperclipProjectRegistry } from './project-registry.js';
export { PaperclipTenantResolver } from './tenant-resolver.js';
export { AnthropicLLMProvider } from './llm-provider.js';
export { redactSecrets } from './redact-secrets.js';
export * from './types.js';

/**
 * Entry point called by Nexus when ADAPTER_PROFILE=permaship.
 *
 * Required env vars:
 *   PERMASHIP_API_URL    — Paperclip base URL (e.g. http://127.0.0.1:3100)
 *   PERMASHIP_API_KEY    — Agent JWT from Paperclip
 *   PERMASHIP_ORG_ID     — Paperclip company ID
 *   PERMASHIP_ORG_NAME   — Human-readable org name (optional, default: PermaShip)
 *   LLM_API_KEY or PERMASHIP_LLM_API_KEY — Anthropic API key for the LLM provider
 */
export function loadPermashipAdapters(): AdapterSet {
  const apiUrl = required('PERMASHIP_API_URL');
  const apiKey = required('PERMASHIP_API_KEY');
  const orgId = required('PERMASHIP_ORG_ID');
  const orgName = process.env.PERMASHIP_ORG_NAME ?? 'PermaShip';
  const llmKey = process.env.PERMASHIP_LLM_API_KEY ?? process.env.LLM_API_KEY ?? '';

  if (!llmKey) {
    console.warn('[permaship-adapters] No LLM_API_KEY or PERMASHIP_LLM_API_KEY set — LLM calls will fail');
  }

  return {
    usageSink: new ConsoleUsageSink(),
    commitProvider: new NoopCommitProvider(),
    knowledgeSource: new EmptyKnowledgeSource(),
    communicationAdapter: new ConsoleCommunicationAdapter(),
    projectRegistry: new PaperclipProjectRegistry(apiUrl, apiKey),
    ticketTracker: new PaperclipTicketTracker(apiUrl, apiKey, orgId),
    tenantResolver: new PaperclipTenantResolver(orgId, orgName),
    llmProvider: new AnthropicLLMProvider(llmKey),
  };
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[permaship-adapters] Missing required env var: ${key}`);
  return val;
}
