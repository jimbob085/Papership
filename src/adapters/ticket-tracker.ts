import type { TicketTracker, CreateSuggestionInput, CreateTicketInput, Suggestion } from './types.js';
import { redactSecrets } from './redact-secrets.js';

const PRIORITY_MAP: Record<number, string> = {
  1: 'critical',
  2: 'high',
  3: 'medium',
  4: 'low',
};

function toPaperclipPriority(n?: number): string {
  if (!n) return 'medium';
  return PRIORITY_MAP[n] ?? 'medium';
}

/**
 * TicketTracker implementation that writes to Paperclip as the backend.
 *
 * createSuggestion -> POST /api/companies/{companyId}/issues (status=todo, non-assigned)
 * acceptSuggestion -> PATCH /api/issues/{id} (status=in_progress, assigns to execution agent)
 * dismissSuggestion -> PATCH /api/issues/{id} (status=cancelled)
 * createTicket -> POST /api/companies/{companyId}/issues
 */
export class PaperclipTicketTracker implements TicketTracker {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly companyId: string;

  constructor(apiUrl: string, apiKey: string, companyId: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.companyId = companyId;
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Paperclip API POST ${path} failed ${res.status}: ${redactSecrets(text)}`);
    }
    return res.json();
  }

  private async patch(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Paperclip API PATCH ${path} failed ${res.status}: ${redactSecrets(text)}`);
    }
    return res.json();
  }

  private async get(path: string): Promise<unknown> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Paperclip API GET ${path} failed ${res.status}: ${redactSecrets(text)}`);
    }
    return res.json();
  }

  async createSuggestion(
    orgId: string,
    input: CreateSuggestionInput,
  ): Promise<{ success: boolean; suggestionId?: string; error?: string }> {
    try {
      const issue = await this.post(`/api/companies/${orgId}/issues`, {
        title: input.title,
        description: `**[Nexus Suggestion]** ${input.description}\n\n*repo: ${input.repoKey} | kind: ${input.kind}*`,
        status: 'todo',
        priority: toPaperclipPriority(input.priority),
        projectId: input.projectId,
      }) as { id: string };
      return { success: true, suggestionId: issue.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async acceptSuggestion(
    _orgId: string,
    _projectId: string,
    suggestionId: string,
  ): Promise<{ success: boolean; ticketId?: string; status?: string; error?: string }> {
    try {
      await this.patch(`/api/issues/${suggestionId}`, { status: 'in_progress' });
      return { success: true, ticketId: suggestionId, status: 'accepted' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async dismissSuggestion(
    _orgId: string,
    _projectId: string,
    suggestionId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.patch(`/api/issues/${suggestionId}`, {
        status: 'cancelled',
        comment: 'Dismissed by Nexus',
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async createTicket(
    input: CreateTicketInput,
  ): Promise<{ success: boolean; ticketId?: string; error?: string }> {
    try {
      const issue = await this.post(`/api/companies/${input.orgId}/issues`, {
        title: input.title,
        description: input.description,
        status: 'todo',
        priority: toPaperclipPriority(input.priority),
        projectId: input.projectId,
      }) as { id: string };
      return { success: true, ticketId: issue.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async listSuggestions(
    orgId: string,
    projectId: string,
    params?: { status?: string; repoKey?: string },
  ): Promise<Suggestion[]> {
    try {
      const statusFilter = params?.status ?? 'todo';
      const issues = await this.get(
        `/api/companies/${orgId}/issues?projectId=${projectId}&status=${statusFilter}`,
      ) as Array<{ id: string; title: string; description?: string; status: string; priority: string; createdAt: string; updatedAt: string }>;

      return issues.map((issue) => ({
        id: issue.id,
        orgId,
        projectId,
        repoKey: params?.repoKey ?? '',
        title: issue.title,
        kind: 'task' as const,
        description: issue.description ?? '',
        affectedFiles: [],
        status: paperclipStatusToSuggestionStatus(issue.status),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      }));
    } catch {
      return [];
    }
  }
}

function paperclipStatusToSuggestionStatus(
  status: string,
): 'pending' | 'accepted' | 'dismissed' | 'superseded' {
  switch (status) {
    case 'todo': return 'pending';
    case 'in_progress':
    case 'in_review':
    case 'done': return 'accepted';
    case 'cancelled': return 'dismissed';
    default: return 'pending';
  }
}
