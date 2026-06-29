export interface PlaneProject {
  id: string;
  name: string;
  identifier: string;
  description: string;
  workspace: string;
  project_lead: string | null;
  created_at: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
}

export interface PlaneModule {
  id: string;
  name: string;
  project: string;
  workspace: string;
}

export interface PlaneWorkItem {
  id: string;
  name: string;
  description_html: string;
  description_binary?: string | null;
  description_stripped?: string;
  sequence_id: number;
  state: string; // state ID
  state_id?: string; // state ID (alternate field)
  priority: 'none' | 'urgent' | 'high' | 'medium' | 'low';
  assignees: string[]; // user IDs
  labels: string[]; // label IDs
  modules: PlaneModule[]; // modules array from Plane API - NEW!
  module_id?: string | null; // module ID (legacy, for compatibility)
  module?: string; // module name (derived from modules[0].name for backward compatibility)
  project: string; // project ID
  workspace: string; // workspace ID
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  parent?: string | null; // parent work item ID
  type_id?: string | null;
  estimate_point?: number | null;
  sort_order?: number;
}

export interface PlaneCreateWorkItemInput {
  name: string;
  description_html?: string;
  project_id: string;
  state_id?: string;
  priority?: 'none' | 'urgent' | 'high' | 'medium' | 'low';
  assignees?: string[];
  labels?: string[];
  module_id?: string;
}

export interface PlaneCommentInput {
  html: string;
  actor?: string;
}

export interface PlaneWorkspaceMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar: string;
  avatar_url: string | null;
  display_name: string;
  role: number;
}

export class PlaneClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'PlaneClientError';
  }
}

export interface PlaneClientOptions {
  apiUrl: string;
  apiKey: string;
  workspaceSlug: string;
  fetch?: typeof fetch;
}

export class PlaneClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly workspaceSlug: string;
  private readonly fetch: typeof fetch;

  constructor(opts: PlaneClientOptions) {
    this.baseUrl = opts.apiUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.workspaceSlug = opts.workspaceSlug;
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await this.fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new PlaneClientError(
          `Plane API request failed: ${response.status} ${response.statusText}`,
          response.status,
          errorText
        );
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof PlaneClientError) {
        throw error;
      }
      throw new PlaneClientError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Normalize work item by extracting module name from modules array for backward compatibility
   * @private
   */
  private normalizeWorkItemModule<T extends PlaneWorkItem>(item: T): T {
    return {
      ...item,
      module: item.modules?.[0]?.name || null,
    };
  }

  async getWorkspaceMembers(): Promise<PlaneWorkspaceMember[]> {
    return this.request<PlaneWorkspaceMember[]>(
      `/api/v1/workspaces/${this.workspaceSlug}/members/`
    );
  }

  async getProjects(): Promise<PlaneProject[]> {
    return this.request<{ results: PlaneProject[] }>(
      `/api/v1/workspaces/${this.workspaceSlug}/projects/`
    ).then(data => data.results);
  }

  async createWorkItem(
    projectId: string,
    input: PlaneCreateWorkItemInput
  ): Promise<PlaneWorkItem> {
    const item = await this.request<PlaneWorkItem>(
      `/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/work-items/`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    return this.normalizeWorkItemModule(item);
  }

  async getWorkItem(projectId: string, workItemId: string): Promise<PlaneWorkItem> {
    const item = await this.request<PlaneWorkItem>(
      `/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/work-items/${workItemId}/`
    );
    return this.normalizeWorkItemModule(item);
  }

  async updateWorkItem(
    projectId: string,
    workItemId: string,
    updates: Partial<Omit<PlaneCreateWorkItemInput, 'project_id'>>
  ): Promise<PlaneWorkItem> {
    const item = await this.request<PlaneWorkItem>(
      `/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/work-items/${workItemId}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
    return this.normalizeWorkItemModule(item);
  }

  async addComment(
    projectId: string,
    workItemId: string,
    comment: PlaneCommentInput
  ): Promise<any> {
    return this.request(
      `/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/work-items/${workItemId}/comments/`,
      {
        method: 'POST',
        body: JSON.stringify(comment),
      }
    );
  }

  async listWorkItems(
    projectId: string,
    filters?: {
      assignees?: string[];
      labels?: string[];
      state?: string;
      module?: string;
    }
  ): Promise<PlaneWorkItem[]> {
    const params = new URLSearchParams();

    if (filters?.assignees?.length) {
      filters.assignees.forEach(id => params.append('assignees', id));
    }
    if (filters?.labels?.length) {
      filters.labels.forEach(id => params.append('labels', id));
    }
    if (filters?.state) {
      params.set('state', filters.state);
    }
    if (filters?.module) {
      params.set('module', filters.module);
    }

    const queryString = params.toString();
    const endpoint = `/api/v1/workspaces/${this.workspaceSlug}/projects/${projectId}/work-items/${queryString ? `?${queryString}` : ''}`;

    const response = await this.request<{ results: PlaneWorkItem[] }>(endpoint);
    return response.results.map(item => this.normalizeWorkItemModule(item));
  }

  async searchWorkItems(query: string): Promise<PlaneWorkItem[]> {
    const response = await this.request<{ results: PlaneWorkItem[] }>(
      `/api/v1/workspaces/${this.workspaceSlug}/search/work-items/?q=${encodeURIComponent(query)}`
    );
    return response.results.map(item => this.normalizeWorkItemModule(item));
  }
}
