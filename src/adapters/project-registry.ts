import type { ProjectRegistry, Project } from './types.js';

/**
 * Queries Paperclip projects API to resolve project IDs and slugs.
 */
export class PaperclipProjectRegistry implements ProjectRegistry {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async getProjects(companyId: string): Promise<Project[]> {
    const res = await fetch(`${this.apiUrl}/api/companies/${companyId}/projects`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as Array<{ id: string; name: string; urlKey: string }>;
    return data.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.urlKey,
      repoKey: null,
    }));
  }

  async listProjects(orgId: string): Promise<Project[]> {
    return this.getProjects(orgId);
  }

  async resolveProjectId(nameOrSlug: string, orgId: string): Promise<string | undefined> {
    const projects = await this.getProjects(orgId);
    return projects.find(
      (p) => p.name === nameOrSlug || p.slug === nameOrSlug,
    )?.id;
  }

  async resolveRepoKey(_projectId: string, _orgId: string): Promise<string | undefined> {
    return undefined;
  }

  async resolveProjectSlug(projectId: string, orgId: string): Promise<string | undefined> {
    const projects = await this.getProjects(orgId);
    return projects.find((p) => p.id === projectId)?.slug;
  }
}
