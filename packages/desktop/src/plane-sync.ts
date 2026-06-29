import type { Store } from '@kanbots/local-store';
import type { IssueSource, Issue } from '@kanbots/core';
import { PlaneClient, type PlaneWorkItem } from './plane-client.js';
import { safeStorage } from 'electron';
import { join } from 'node:path';

interface PlaneSyncConfig {
  api_url: string;
  api_key_encrypted: Buffer | null;
  api_key_encryption: string;
  workspace_slug: string;
  project_ids: string[];
  user_uuid?: string;
  poll_interval_seconds: number;
  enabled: number;
  moduleRepoMap?: Record<string, string>;
}

export class PlaneSync {
  private client: PlaneClient | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private config: PlaneSyncConfig | null = null;

  constructor(
    private store: Store,
    private issueSource: IssueSource
  ) {}

  /**
   * 获取当前配置状态
   */
  getStatus(): { enabled: boolean; configured: boolean; lastSyncedAt: string | null; lastError: string | null } {
    const db = (this.store as any).db;
    const config = db.prepare('SELECT enabled, last_synced_at, last_error FROM plane_sync_config WHERE id = 1').get() as any;

    if (!config) {
      return { enabled: false, configured: false, lastSyncedAt: null, lastError: null };
    }

    return {
      enabled: Boolean(config.enabled),
      configured: true,
      lastSyncedAt: config.last_synced_at || null,
      lastError: config.last_error || null
    };
  }

  /**
   * 更新配置
   */
  async updateConfig(updates: Partial<PlaneSyncConfig>): Promise<void> {
    const db = (this.store as any).db;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.api_url !== undefined) {
      fields.push('api_url = ?');
      values.push(updates.api_url);
    }

    if (updates.apiKey !== undefined) {
      await this.setApiKey(updates.apiKey);
    }

    if (updates.workspace_slug !== undefined) {
      fields.push('workspace_slug = ?');
      values.push(updates.workspace_slug);
    }

    if (updates.project_ids !== undefined) {
      fields.push('project_ids = ?');
      values.push(JSON.stringify(updates.project_ids));
    }

    if (updates.user_uuid !== undefined) {
      fields.push('user_uuid = ?');
      values.push(updates.user_uuid);
    }

    if (updates.poll_interval_seconds !== undefined) {
      fields.push('poll_interval_seconds = ?');
      values.push(updates.poll_interval_seconds);
    }

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(1); // WHERE id = 1

      db.prepare(`UPDATE plane_sync_config SET ${fields.join(', ')} WHERE id = 1`).run(...values);

      // 如果启用了同步且当前未运行，重新启动
      if (updates.enabled && !this.pollInterval) {
        await this.start();
      } else if (updates.enabled === false && this.pollInterval) {
        this.stop();
      }

      console.log('[Plane Sync] Configuration updated');
    }
  }

  /**
   * 测试API连接
   */
  async testConnection(apiUrl?: string, apiKey?: string, workspaceSlug?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const testUrl = apiUrl || this.config?.api_url;
      const testKey = apiKey || (this.config ? await this.getDecryptedApiKey() : '');
      const testWorkspace = workspaceSlug || this.config?.workspace_slug;

      if (!testUrl || !testKey || !testWorkspace) {
        return { success: false, error: '缺少必要的连接参数' };
      }

      const testClient = new PlaneClient({
        apiUrl: testUrl,
        apiKey: testKey,
        workspaceSlug: testWorkspace
      });

      // 尝试获取工作区信息
      await testClient.getWorkspaceMembers();

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  async start(): Promise<void> {
    const config = await this.loadConfig();
    if (!config || !config.enabled) {
      console.log('[Plane Sync] Not configured or disabled');
      return;
    }

    this.config = config;

    const apiKey = await this.getDecryptedApiKey();
    if (!apiKey) {
      console.error('[Plane Sync] No valid API key available, cannot start sync');
      return;
    }

    this.client = new PlaneClient({
      apiUrl: config.api_url,
      apiKey: apiKey,
      workspaceSlug: config.workspace_slug,
    });

    console.log('[Plane Sync] Starting synchronization...');
    console.log('[Plane Sync] Workspace:', config.workspace_slug);
    console.log('[Plane Sync] Projects:', config.project_ids);
    console.log('[Plane Sync] Poll interval:', config.poll_interval_seconds, 'seconds');

    await this.syncDown();
    this.startPolling();
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[Plane Sync] Stopped');
  }

  /**
   * 设置API Key并加密存储
   * @param apiKey Plain text API key
   */
  async setApiKey(apiKey: string): Promise<void> {
    let encryptedKey: Buffer;
    let encryptionType: string;

    if (safeStorage.isEncryptionAvailable()) {
      try {
        encryptedKey = safeStorage.encryptString(apiKey);
        encryptionType = 'safeStorage';
      } catch (error) {
        console.error('[Plane Sync] Failed to encrypt API key:', error);
        encryptedKey = Buffer.from(apiKey);
        encryptionType = 'plain';
      }
    } else {
      console.warn('[Plane Sync] Encryption not available, storing plain text');
      encryptedKey = Buffer.from(apiKey);
      encryptionType = 'plain';
    }

    const db = (this.store as any).db;
    db.prepare(
      'UPDATE plane_sync_config SET api_key_encrypted = ?, api_key_encryption = ?, updated_at = ? WHERE id = 1'
    ).run(encryptedKey, encryptionType, new Date().toISOString());

    console.log('[Plane Sync] API key updated and encrypted');
  }

  /**
   * 获取解密后的API Key
   */
  private async getDecryptedApiKey(): Promise<string> {
    const db = (this.store as any).db;
    const config = db.prepare('SELECT api_key_encrypted, api_key_encryption FROM plane_sync_config WHERE id = 1').get() as any;

    if (!config || !config.api_key_encrypted) {
      return '';
    }

    if (config.api_key_encryption === 'safeStorage' && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(config.api_key_encrypted);
      } catch (error) {
        console.error('[Plane Sync] Failed to decrypt API key:', error);
        return config.api_key_encrypted.toString();
      }
    }

    return config.api_key_encrypted.toString();
  }

  private getFirstProjectId(): string | null {
    if (!this.config || !this.config.project_ids.length) return null;
    return this.config.project_ids[0];
  }

  private async loadConfig(): Promise<PlaneSyncConfig | null> {
    const db = (this.store as any).db;
    const rawConfig = db.prepare('SELECT * FROM plane_sync_config WHERE id = 1').get() as any;

    if (!rawConfig) return null;

    // 解析JSON字段
    const config: PlaneSyncConfig = {
      ...rawConfig,
      project_ids: typeof rawConfig.project_ids === 'string'
        ? JSON.parse(rawConfig.project_ids)
        : rawConfig.project_ids,
    };

    try {
      const workspaceConfig = await this.loadWorkspaceConfig();
      if (workspaceConfig?.planeSync?.moduleRepoMap) {
        console.log('[Plane Sync] Loaded moduleRepoMap from workspace config:', Object.keys(workspaceConfig.planeSync.moduleRepoMap));
        return { ...config, moduleRepoMap: workspaceConfig.planeSync.moduleRepoMap };
      }
    } catch (error) {
      console.warn('[Plane Sync] Failed to load workspace config:', error);
    }

    // 如果没有找到workspace配置，返回空映射
    return { ...config, moduleRepoMap: {} };
  }

  /**
   * 加载workspace配置
   */
  private async loadWorkspaceConfig(): Promise<{ planeSync?: { moduleRepoMap: Record<string, string> } } | null> {
    try {
      const workspacePath = process.cwd();
      const configPath = join(workspacePath, '.kanbots', 'config.json');
      const { readFile } = await import('node:fs/promises');
      const configContent = await readFile(configPath, 'utf-8');
      return JSON.parse(configContent);
    } catch (error) {
      return null;
    }
  }

  private startPolling(): void {
    if (!this.config) return;

    // Add jitter to prevent thundering herd (±20%)
    const baseInterval = this.config.poll_interval_seconds * 1000;
    const jitter = baseInterval * 0.2 * (Math.random() * 2 - 1);
    const intervalMs = baseInterval + jitter;

    this.pollInterval = setInterval(() => {
      this.syncDown()
        .then(() => this.syncMissingUpstream()) // 同步遗漏的Issues
        .then(() => this.updateLastSyncedAt())
        .catch((error) => {
          console.error('[Plane Sync] Poll error:', error);
          return this.updateLastError(error instanceof Error ? error.message : 'Unknown error');
        });
    }, intervalMs);

    console.log(`[Plane Sync] Polling every ${this.config.poll_interval_seconds}s (downstream + missing upstream sync)`);
  }

  private async syncDown(): Promise<void> {
    if (!this.client || !this.config) return;

    console.log('[Plane Sync] Running down sync...');

    const projectIds = this.config.project_ids;
    if (!projectIds.length) {
      console.log('[Plane Sync] No projects configured');
      return;
    }

    for (const projectId of projectIds) {
      try {
        const workItems = await this.client.listWorkItems(projectId, {
          assignees: this.config.user_uuid ? [this.config.user_uuid] : [],
        });

        for (const workItem of workItems) {
          await this.syncWorkItemToKanbots(workItem);
        }
      } catch (error) {
        console.error(`[Plane Sync] Error syncing project ${projectId}:`, error);
      }
    }
  }

  async syncWorkItemToKanbots(workItem: PlaneWorkItem): Promise<void> {
    if (!this.client || !this.config) return;

    const localIssues = this.store.localIssues;

    // 检查localIssues是否可用
    if (!localIssues) {
      console.error('[Plane Sync] localIssues not available in store');
      return;
    }

    let issue = localIssues.findByPlaneWorkItemId(workItem.id);

    if (!issue) {
      console.log('[Plane Sync] Creating new Kanbots issue for Plane item:', workItem.sequence_id);

      // 使用module_id而不是module字符串
      const repoName = this.resolveRepoFromModule(workItem.module_id);
      console.log('[Plane Sync] Target repository:', repoName);

      // 构建标签列表
      const labels: string[] = [
        `plane-seq-${workItem.sequence_id}`,
        `plane-id-${workItem.id}`,
        `repo:${repoName}`,
        `plane-workspace:${workItem.workspace}`,
        `plane-project:${workItem.project}`,
      ];

      if (workItem.priority !== 'none') {
        labels.push(`priority:${workItem.priority}`);
      }
      if (workItem.module_id) {
        labels.push(`module-id:${workItem.module_id}`);
      }

      // 转换HTML描述为Markdown
      const description = workItem.description_html
        ? htmlToMarkdown(workItem.description_html)
        : workItem.description_stripped || '';

      const newIssue = await this.issueSource.createIssue({
        title: workItem.name,
        body: description,
        labels: labels,
      });

      this.store.localIssues.setPlaneWorkItemId(newIssue.number, workItem.id);
      issue = newIssue;
      console.log('[Plane Sync] Created Kanbots issue:', newIssue.number, '← Plane:', workItem.sequence_id, 'in repo:', repoName);
    } else {
      // 更新现有Issue
      await this.issueSource.updateIssue(issue.number, {
        title: workItem.name,
        body: workItem.description_html
          ? htmlToMarkdown(workItem.description_html)
          : workItem.description_stripped || '',
      });
    }

    console.log('[Plane Sync] Updated Kanbots issue:', issue.number, 'from Plane:', workItem.sequence_id);
  }

  /**
   * 根据Plane Module ID解析对应的仓库名称
   * @param moduleId Plane Module ID
   * @returns 仓库名称，如果未配置则返回默认仓库
   */
  private resolveRepoFromModule(moduleId: string | null | undefined): string {
    if (!moduleId || !this.config?.moduleRepoMap) {
      return 'default-repo';
    }

    // 从配置中查找Module ID映射
    if (moduleId in this.config.moduleRepoMap) {
      const repoName = this.config.moduleRepoMap[moduleId];
      console.log('[Plane Sync] Mapped module ID:', moduleId, '→ repo:', repoName);
      return repoName;
    }

    // 如果没有找到映射，返回默认仓库
    console.warn('[Plane Sync] No repo mapping found for module ID:', moduleId, ', using default repo');
    return 'default-repo';
  }

  async onIssueCreated(issue: Issue): Promise<void> {
    if (!this.client || !this.config) return;

    const projectId = this.getFirstProjectId();
    if (!projectId) {
      console.error('[Plane Sync] No project configured');
      return;
    }

    // 从Issue labels中提取仓库信息，反向查找Module
    const repoLabel = issue.labels.find(label => label.startsWith('repo:'));
    const moduleName = repoLabel ? this.findModuleByRepo(repoLabel.replace('repo:', '')) : undefined;

    const planeWorkItemId = this.store.localIssues.getPlaneWorkItemId(issue.number);

    try {
      if (planeWorkItemId) {
        await this.client.updateWorkItem(projectId, planeWorkItemId, {
          name: issue.title,
          description_html: markdownToHtml(issue.body || ''),
          ...(moduleName && { module_id: moduleName }),
        });
        console.log('[Plane Sync] Updated Plane work item:', planeWorkItemId);
      } else {
        const workItem = await this.client.createWorkItem(projectId, {
          name: issue.title,
          description_html: markdownToHtml(issue.body || ''),
          priority: 'none',
          ...(moduleName && { module_id: moduleName }),
        });

        this.store.localIssues.setPlaneWorkItemId(issue.number, workItem.id);
        console.log('[Plane Sync] Created Plane work item:', workItem.sequence_id);
      }
    } catch (error) {
      console.error('[Plane Sync] Failed to sync issue to Plane:', issue.number, error);
      // 静默失败，下次轮询会重试
    }
  }

  /**
   * 获取所有未同步的Issues（没有plane_workitem_id的）
   */
  private getUnsyncedIssues(): Issue[] {
    try {
      const db = (this.store as any).db;
      const results = db.prepare(
        'SELECT number, title, body, state, labels, assignees, author_login, created_at, updated_at FROM local_issues WHERE plane_workitem_id IS NULL LIMIT 50'
      ).all() as any[];

      return results.map(row => ({
        number: row.number,
        title: row.title,
        body: row.body,
        state: row.state,
        labels: JSON.parse(row.labels),
        assignees: JSON.parse(row.assignees),
        user: { login: row.author_login, avatarUrl: null },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        closedAt: null,
        htmlUrl: '',
        isPullRequest: false,
      }));
    } catch (error) {
      console.error('[Plane Sync] Failed to get unsynced issues:', error);
      return [];
    }
  }

  /**
   * 主动同步所有遗漏的Issues
   */
  async syncMissingUpstream(): Promise<void> {
    if (!this.client || !this.config) return;

    const unsyncedIssues = this.getUnsyncedIssues();
    if (unssyncedIssues.length === 0) {
      return;
    }

    console.log(`[Plane Sync] Found ${unssyncedIssues.length} unsynced issues, starting upstream sync`);

    for (const issue of unsyncedIssues) {
      try {
        await this.onIssueCreated(issue);
        console.log('[Plane Sync] Successfully synced issue:', issue.number);
      } catch (error) {
        console.error('[Plane Sync] Failed to sync issue:', issue.number, error);
        // 失败的issue下次轮询会再尝试
      }
    }
  }

  async onAgentComplete(run: any, store: Store): Promise<void> {
    if (!this.client || !this.config) return;

    const db = (store as any).db;
    const planeWorkItemId = db.localIssues.getPlaneWorkItemId(run.issueNumber);

    if (!planeWorkItemId) {
      console.log('[Plane Sync] No Plane mapping found for issue:', run.issueNumber);
      return;
    }

    try {
      const comment = this.generateAgentReportComment(run);
      const projectId = this.getFirstProjectId();

      if (!projectId) {
        console.error('[Plane Sync] No project configured');
        return;
      }

      await this.client.addComment(projectId, planeWorkItemId, {
        html: comment,
      });

      console.log('[Plane Sync] Agent completion reported to Plane');
    } catch (error) {
      console.error('[Plane Sync] Error reporting agent completion:', error);
    }
  }

  private async updateLastSyncedAt(): Promise<void> {
    const db = (this.store as any).db;
    const now = new Date().toISOString();
    db.prepare('UPDATE plane_sync_config SET last_synced_at = ? WHERE id = 1').run(now);
  }

  private async updateLastError(error: string): Promise<void> {
    const db = (this.store as any).db;
    db.prepare('UPDATE plane_sync_config SET last_error = ? WHERE id = 1').run(error);
  }

  private generateAgentReportComment(run: any): string {
    const duration = ((run.durationMs || 0) / 1000 / 60).toFixed(2);
    const cost = (run.totalCostUsd || 0).toFixed(2);

    return `
<h3>🤖 Agent 执行报告</h3>
<table>
<tr><td><b>状态</b></td><td>${run.finalState || 'completed'}</td></tr>
<tr><td><b>模型</b></td><td>${run.model || 'unknown'}</td></tr>
<tr><td><b>耗时</b></td><td>${duration} 分钟</td></tr>
<tr><td><b>Token</b></td><td>${run.tokenUsageInput || 0} in / ${run.tokenUsageOutput || 0} out</td></tr>
<tr><td><b>费用</b></td><td>$${cost}</td></tr>
<tr><td><b>仓库</b></td><td>${run.repoPath || 'unknown'}</td></tr>
<tr><td><b>分支</b></td><td><code>${run.branchName || 'unknown'}</code></td></tr>
</table>
    `.trim();
  }
}

function htmlToMarkdown(html: string): string {
  if (!html) return '';
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1')
    .replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

function markdownToHtml(markdown: string): string {
  if (!markdown) return '<p></p>';
  return markdown
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`(.*?)`/gim, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(?!<[hp])/gm, '<p>$1</p>');
}
