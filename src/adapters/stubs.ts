import type {
  UsageSink,
  UsagePayload,
  CommitProvider,
  KnowledgeSource,
  KnowledgeDocument,
  CommunicationAdapter,
  OutboundMessage,
  SendMessageOptions,
} from './types.js';
import { redactSecrets } from './redact-secrets.js';

export class ConsoleUsageSink implements UsageSink {
  async reportUsage(orgId: string, payload: UsagePayload): Promise<void> {
    console.log(redactSecrets(
      JSON.stringify({ tag: '[permaship-adapters] usage', orgId, ...payload }),
    ));
  }
}

export class NoopCommitProvider implements CommitProvider {
  async fetchLatestCommit(
    _orgId: string,
    _repoKey: string,
  ): Promise<{ sha: string; date: string } | null> {
    return null;
  }

  async fetchCommitsSince(
    _orgId: string,
    _repoKey: string,
    _since: string,
  ): Promise<Array<{ sha: string; files: string[] }> | null> {
    return null;
  }
}

export class EmptyKnowledgeSource implements KnowledgeSource {
  async fetchKnowledgeDocuments(
    _orgId: string,
    _projectId: string,
  ): Promise<KnowledgeDocument[]> {
    return [];
  }
}

export class ConsoleCommunicationAdapter implements CommunicationAdapter {
  async sendMessage(
    message: OutboundMessage,
    options: SendMessageOptions,
  ): Promise<{ success: boolean; message_id?: string; thread_id?: string; error?: string }> {
    console.log(redactSecrets(
      JSON.stringify({ tag: '[permaship-adapters] sendMessage', message, options }),
    ));
    return { success: true, message_id: `console-${Date.now()}` };
  }

  async addReaction(
    _channelId: string,
    _messageId: string,
    _emoji: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async renameThread(
    _threadId: string,
    _newName: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }
}
