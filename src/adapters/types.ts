// Mirror of Nexus adapter interfaces — kept in sync structurally (TypeScript duck-typing)

export interface AdapterSet {
  usageSink: UsageSink;
  commitProvider: CommitProvider;
  knowledgeSource: KnowledgeSource;
  communicationAdapter: CommunicationAdapter;
  projectRegistry: ProjectRegistry;
  ticketTracker: TicketTracker;
  tenantResolver: TenantResolver;
  llmProvider: LLMProvider;
  sourceExplorer?: SourceExplorer;
  workspaceProvider?: WorkspaceProvider;
}

// UsageSink
export interface UsagePayload {
  inputTokens: number;
  outputTokens: number;
  turns: number;
  windowStartedAt: string;
}
export interface UsageSink {
  reportUsage(orgId: string, payload: UsagePayload): Promise<void>;
}

// CommitProvider
export interface CommitProvider {
  fetchLatestCommit(orgId: string, repoKey: string): Promise<{ sha: string; date: string } | null>;
  fetchCommitsSince(orgId: string, repoKey: string, since: string): Promise<Array<{ sha: string; files: string[] }> | null>;
}

// KnowledgeSource
export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  version: number;
  updatedAt: string;
}
export interface KnowledgeSource {
  fetchKnowledgeDocuments(orgId: string, projectId: string): Promise<KnowledgeDocument[]>;
}

// CommunicationAdapter
export interface OutboundMessage {
  content?: string;
  embed_title?: string;
  embed_description?: string;
  embed_color?: number;
  components?: unknown[];
}
export interface SendMessageOptions {
  thread_id?: string;
  channel_id?: string;
  dm_user_id?: string;
  create_thread_title?: string;
  orgId?: string;
}
export interface CommunicationAdapter {
  sendMessage(message: OutboundMessage, options: SendMessageOptions): Promise<{ success: boolean; message_id?: string; thread_id?: string; error?: string }>;
  addReaction(channelId: string, messageId: string, emoji: string, orgId?: string): Promise<{ success: boolean; error?: string }>;
  renameThread(threadId: string, newName: string, orgId?: string): Promise<{ success: boolean; error?: string }>;
}

// ProjectRegistry
export interface Project {
  id: string;
  name: string;
  slug: string;
  repoKey?: string | null;
}
export interface ProjectRegistry {
  listProjects(orgId: string): Promise<Project[]>;
  resolveProjectId(nameOrSlug: string, orgId: string): Promise<string | undefined>;
  resolveRepoKey(projectId: string, orgId: string): Promise<string | undefined>;
  resolveProjectSlug(projectId: string, orgId: string): Promise<string | undefined>;
}

// TicketTracker
export interface CreateSuggestionInput {
  repoKey: string;
  title: string;
  kind: 'bug' | 'feature' | 'task';
  description: string;
  projectId: string;
  priority?: number;
  labels?: string[];
}
export interface CreateTicketInput {
  orgId: string;
  kind: 'bug' | 'feature' | 'task';
  title: string;
  description: string;
  repoKey: string;
  projectId: string;
  priority?: number;
  labels?: string[];
  createdByAgentId: string;
}
export interface Suggestion {
  id: string;
  orgId: string;
  projectId: string;
  repoKey: string;
  title: string;
  kind: 'bug' | 'feature' | 'task';
  description: string;
  affectedFiles: string[];
  status: 'pending' | 'accepted' | 'dismissed' | 'superseded';
  createdAt: string;
  updatedAt: string;
}
export interface TicketTracker {
  createSuggestion(orgId: string, input: CreateSuggestionInput): Promise<{ success: boolean; suggestionId?: string; error?: string }>;
  acceptSuggestion(orgId: string, projectId: string, suggestionId: string): Promise<{ success: boolean; ticketId?: string; status?: string; error?: string }>;
  dismissSuggestion(orgId: string, projectId: string, suggestionId: string): Promise<{ success: boolean; error?: string }>;
  createTicket(input: CreateTicketInput): Promise<{ success: boolean; ticketId?: string; error?: string }>;
  listSuggestions(orgId: string, projectId: string, params?: { status?: string; repoKey?: string }): Promise<Suggestion[]>;
}

// TenantResolver
export interface WorkspaceContext {
  orgId: string;
  orgName?: string;
  platform: 'discord' | 'slack' | 'github';
  workspaceId: string;
  internalChannelId?: string;
}
export interface TenantResolver {
  getContext(platform: 'discord' | 'slack' | 'github', workspaceId: string): Promise<WorkspaceContext | null>;
  linkWorkspace(orgId: string, platform: 'discord' | 'slack' | 'github', workspaceId: string, activatedBy: string, channelId: string, orgName?: string): Promise<{ success: boolean; error?: string }>;
  setInternalChannel(platform: 'discord' | 'slack' | 'github', workspaceId: string, channelId: string): Promise<{ success: boolean; error?: string }>;
  getOrgName(orgId: string): Promise<string>;
  activateWorkspace(token: string, platform: 'discord' | 'slack' | 'github', workspaceId: string, activatedBy: string, channelId: string): Promise<{ success: boolean; orgId?: string; orgName?: string; error?: string }>;
  shouldPrompt(platform: 'discord' | 'slack' | 'github', workspaceId: string, channelId: string): boolean;
}

// LLMProvider
export type ModelTier = 'ROUTER' | 'AGENT' | 'WORK' | 'EMBEDDING';
export interface LLMContent {
  role: string;
  parts: Array<{
    text?: string;
    functionCall?: { name: string; args: Record<string, unknown>; id?: string };
    functionResponse?: { name: string; response: unknown; id?: string };
    [key: string]: unknown;
  }>;
}
export interface LLMFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface GenerateTextOptions {
  model: ModelTier;
  systemInstruction?: string;
  contents: LLMContent[];
  orgId?: string;
}
export interface GenerateWithToolsOptions extends GenerateTextOptions {
  tools: LLMFunctionDeclaration[];
}
export interface LLMToolCallResult {
  text: string | null;
  functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
  raw: unknown;
}
export interface LLMProvider {
  generateText(options: GenerateTextOptions): Promise<string>;
  generateWithTools(options: GenerateWithToolsOptions): Promise<LLMToolCallResult>;
  embedText(text: string): Promise<number[] | null>;
}

// SourceExplorer (optional)
export interface DirectoryEntry { name: string; type: 'file' | 'directory'; path: string; }
export interface CodeSearchMatch { file: string; line: number; content: string; }
export interface SourceExplorer {
  listDirectory(orgId: string, repoKey: string, path: string): Promise<DirectoryEntry[]>;
  readFile(orgId: string, repoKey: string, path: string): Promise<string | null>;
  searchCode(orgId: string, repoKey: string, query: string): Promise<CodeSearchMatch[]>;
}

// WorkspaceProvider (optional)
export interface WorkspaceHandle { repoPath: string; repoKey: string; cleanup: () => Promise<void>; }
export interface WorkspaceProvider {
  acquireWorkspace(orgId: string, repoKey: string): Promise<WorkspaceHandle>;
}
