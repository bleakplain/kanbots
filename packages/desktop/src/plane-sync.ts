import type { Store } from '@kanbots/local-store';
import type { IssueSource, Issue } from '@kanbots/core';
import { PlaneClient, type PlaneWorkItem } from './plane-client.js';
import { safeStorage } from 'electron';
import { join } from 'node:path';

interface PlaneSyncConfig {
  api_url: string;
  api_key: string;
  workspace_slug: string;
  project_ids: string[];
  user_uuid?: string;
  poll_interval_seconds: number;
  enabled: number;
}

export class PlaneSync {
  private client: PlaneClient | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private config: PlaneSyncConfig | null = null;

  constructor(
    private store: Store,
    private issueSource: IssueSource
  ) {}

  getSyncStatus(): { enabled: boolean; configured: boolean; lastSyncedAt: string | null; lastError: string | null } {
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

  async updateConfig(updates: Partial<PlaneSyncConfig>): Promise<void> {
    const db = (this.store as any).db;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.api_url !== undefined) {
      fields.push('api_url = ?');
      values.push(updates.api_url);
    }

    if (updates.api_key !== undefined) {
      await this.setApiKey(updates.api_key);
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

      if (updates.enabled && !this.pollInterval) {
        await this.start();
      } else if (!updates.enabled && this.pollInterval) {
        this.stop();
      }

      console.log('[Plane Sync] Configuration updated');
    }
  }

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

    await this.syncDownstream();
    this.startPolling();
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[Plane Sync] Stopped');
  }

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

    const config: PlaneSyncConfig = {
      ...rawConfig,
      project_ids: typeof rawConfig.project_ids === 'string'
        ? JSON.parse(rawConfig.project_ids)
        : rawConfig.project_ids,
    };

    console.log('[Plane Sync] ✅ 零配置模式：使用 Plane Module 自然属性');
    return config;
  }

  private startPolling(): void {
    if (!this.config) return;

    // Add jitter to prevent thundering herd (±20%)
    const baseInterval = this.config.poll_interval_seconds * 1000;
    const jitter = baseInterval * 0.2 * (Math.random() * 2 - 1);
    const intervalMs = baseInterval + jitter;

    this.pollInterval = setInterval(() => {
      this.syncUpstream().catch((error) => {
        console.error('[Plane Sync] Push error:', error);
        return this.updateLastError(error instanceof Error ? error.message : 'Unknown error');
      });

      this.syncDownstream()
        .then(() => this.updateLastSyncedAt())
        .catch((error) => {
          console.error('[Plane Sync] Pull error:', error);
          return this.updateLastError(error instanceof Error ? error.message : 'Unknown error');
        });
    }, intervalMs);

    console.log(`[Plane Sync] Polling every ${this.config.poll_interval_seconds}s (downstream + missing upstream sync)`);
  }

  private async syncDownstream(): Promise<void> {
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

      // 零配置：智能解析仓库名称
      const repoName = this.resolveRepoName(workItem);
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

      // 如果有模块名称，添加原始模块名作为参考
      if (workItem.module) {
        labels.push(`plane-module:${workItem.module}`);
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
   * 智能解析仓库名称 - 零配置方案
   * 使用 Plane 的自然属性：标签 > Module 名称
   * @param workItem Plane Work Item
   * @returns 标准化的仓库名称
   */
  private resolveRepoName(workItem: PlaneWorkItem): string {
    // 1. 优先使用标签中的仓库信息（用户可以精确控制）
    const repoLabel = workItem.labels.find(label => label.startsWith('repo:'));
    if (repoLabel) {
      const repoName = repoLabel.replace('repo:', '');
      console.log(`[Plane Sync] 🏷️  从标签解析仓库: ${repoName}`);
      return repoName;
    }

    // 2. 使用 Module 名称（Plane 的自然属性）
    if (workItem.module) {
      const repoName = this.normalizeRepoName(workItem.module);
      console.log(`[Plane Sync] 📦 从模块解析仓库: ${workItem.module} → ${repoName}`);
      return repoName;
    }

    // 3. 终极降级
    console.warn('[Plane Sync] ⚠️  无法从模块解析仓库名，使用默认仓库');
    return 'default-repo';
  }

  /**
   * 标准化仓库名称
   * @param name 原始名称（Module 或 Project 名称）
   * @returns 标准化的仓库名称
   */
  private normalizeRepoName(name: string): string {
    return name
      .toLowerCase()                    // 转小写
      .replace(/[^a-z0-9\s-]/g, '')    // 移除特殊字符
      .replace(/\s+/g, '-')             // 空格转横线
      .replace(/-+/g, '-')              // 多个横线合并
      .trim();                          // 去除首尾空格
  }

  async onIssueCreated(issue: Issue): Promise<void> {
    if (!this.client || !this.config) return;

    const projectId = this.getFirstProjectId();
    if (!projectId) {
      console.error('[Plane Sync] No project configured');
      return;
    }

    // 零配置：从 Issue 标签中提取仓库信息
    const repoLabel = issue.labels.find(label => label.startsWith('repo:'));
    const repoName = repoLabel ? repoLabel.replace('repo:', '') : 'default-repo';

    console.log(`[Plane Sync] 📤 上行同步到仓库: ${repoName}`);

    const planeWorkItemId = this.store.localIssues.getPlaneWorkItemId(issue.number);

    try {
      if (planeWorkItemId) {
        await this.client.updateWorkItem(projectId, planeWorkItemId, {
          name: issue.title,
          description_html: markdownToHtml(issue.body || ''),
        });
        console.log('[Plane Sync] Updated Plane work item:', planeWorkItemId);
      } else {
        const workItem = await this.client.createWorkItem(projectId, {
          name: issue.title,
          description_html: markdownToHtml(issue.body || ''),
          priority: 'none',
        });

        this.store.localIssues.setPlaneWorkItemId(issue.number, workItem.id);
        console.log('[Plane Sync] Created Plane work item:', workItem.sequence_id);
      }
    } catch (error) {
      console.error('[Plane Sync] Failed to sync issue to Plane:', issue.number, error);
      // 静默失败，下次轮询会重试
    }
  }

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

  async syncUpstream(): Promise<void> {
    if (!this.client || !this.config) return;

    const unsyncedIssues = this.getUnsyncedIssues();
    if (unsyncedIssues.length === 0) {
      return;
    }

    console.log(`[Plane Sync] Found ${unsyncedIssues.length} unsynced issues, starting upstream sync`);

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
