import type { TenantResolver, WorkspaceContext } from './types.js';

/**
 * Single-tenant resolver for PermaShip/Paperclip.
 * All workspace lookups resolve to the configured org.
 */
export class PaperclipTenantResolver implements TenantResolver {
  private readonly orgId: string;
  private readonly orgName: string;

  constructor(orgId: string, orgName: string) {
    this.orgId = orgId;
    this.orgName = orgName;
  }

  async getContext(
    platform: 'discord' | 'slack' | 'github',
    workspaceId: string,
  ): Promise<WorkspaceContext | null> {
    return {
      orgId: this.orgId,
      orgName: this.orgName,
      platform,
      workspaceId,
    };
  }

  async linkWorkspace(
    _orgId: string,
    _platform: 'discord' | 'slack' | 'github',
    _workspaceId: string,
    _activatedBy: string,
    _channelId: string,
    _orgName?: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async setInternalChannel(
    _platform: 'discord' | 'slack' | 'github',
    _workspaceId: string,
    _channelId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async getOrgName(_orgId: string): Promise<string> {
    return this.orgName;
  }

  async activateWorkspace(
    _token: string,
    platform: 'discord' | 'slack' | 'github',
    workspaceId: string,
    _activatedBy: string,
    _channelId: string,
  ): Promise<{ success: boolean; orgId?: string; orgName?: string; error?: string }> {
    return { success: true, orgId: this.orgId, orgName: this.orgName };
  }

  shouldPrompt(
    _platform: 'discord' | 'slack' | 'github',
    _workspaceId: string,
    _channelId: string,
  ): boolean {
    return false;
  }
}
