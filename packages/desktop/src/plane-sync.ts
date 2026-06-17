import type { Store } from '@kanbots/local-store';
import type { IssueSource, Issue } from '@kanbots/core';
import { PlaneClient, type PlaneWorkItem } from './plane-client.js';
import type { Database } from 'better-sqlite3';

interface PlaneSyncConfig {
  api_url: string;
  api_key: string;
  workspace_slug: string;
  project_ids: string[];
  user_uuid?: string;
  poll_interval_seconds: number;
  enabled: number;
}

interface PlaneSyncMapping {
  plane_id: string;
  plane_sequence_id: number;
  kanbots_number: number;
  source: 'plane' | 'kanbots';
  owner?: string;
  plane_module?: string;
  repo_name?: string;
  plane_status?: string;
  kanbots_status?: string;
  last_synced_at: string;
}

export class PlaneSync {
  private client: PlaneClient | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private config: PlaneSyncConfig | null = null;

  constructor(
    private store: Store,
    private issueSource: IssueSource
  ) {}

  async start(): Promise<void> {
    const config = await this.loadConfig();
    if (!config || !config.enabled) {
      console.log('[Plane Sync] Not configured or disabled');
      return;
    }

    this.config = config;
    this.client = new PlaneClient({
      apiUrl: config.api_url,
      apiKey: config.api_key,
      workspaceSlug: config.workspace_slug,
    });

    console.log('[Plane Sync] Starting synchronization...');
    await this.syncDown(); // 立即执行一次同步

    // 启动定时轮询
    this.startPolling();
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[Plane Sync] Stopped');
  }

  private getFirstProjectId(): string | null {
    if (!this.config || !this.config.project_ids.length) return null;
    return this.config.project_ids[0];
  }

  private async loadConfig(): Promise<PlaneSyncConfig | null> {
    const db = (this.store as any).db as Database;
    return db
      .prepare('SELECT * FROM plane_sync_config WHERE id = 1')
      .get() as PlaneSyncConfig | undefined;
  }

  private startPolling(): void {
    if (!this.config) return;

    const intervalMs = this.config.poll_interval_seconds * 1000;
    this.pollInterval = setInterval(() => {
      this.syncDown()
        .then(() => this.updateLastSyncedAt())
        .catch((error) => {
          console.error('[Plane Sync] Poll error:', error);
          return this.updateLastError(
            error instanceof Error ? error.message : 'Unknown error'
          );
        });
    }, intervalMs);

    console.log(`[Plane Sync] Polling every ${this.config.poll_interval_seconds}s`);
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
        // 获取分配给当前用户的 Work Items
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

  private async syncWorkItemToKanbots(workItem: PlaneWorkItem): Promise<void> {
    const db = (this.store as any).db as Database;

    // 检查是否已存在映射
    const existing = db
      .prepare('SELECT * FROM plane_sync_mapping WHERE plane_id = ?')
      .get(workItem.id) as PlaneSyncMapping | undefined;

    if (existing) {
      // 更新现有 Issue
      await this.updateKanbotsIssue(existing.kanbots_number, workItem);
      this.updateMapping(workItem.id, existing.kanbots_number, workItem);
    } else {
      // 创建新 Issue
      const newIssue = await this.createKanbotsIssue(workItem);
      this.createMapping(workItem.id, newIssue.number, workItem);
    }
  }

  private async createKanbotsIssue(workItem: PlaneWorkItem): Promise<Issue> {
    // 将 HTML 描述转换为 Markdown
    const body = htmlToMarkdown(workItem.description_html);

    // 提取 labels
    const labels = [
      `plane-seq-${workItem.sequence_id}`,
      workItem.priority !== 'none' ? `priority:${workItem.priority}` : undefined,
      ...(workItem.labels || []),
    ].filter(Boolean) as string[];

    return this.issueSource.createIssue({
      title: workItem.name,
      body,
      labels,
    });
  }

  private async updateKanbotsIssue(
    issueNumber: number,
    workItem: PlaneWorkItem
  ): Promise<void> {
    const body = htmlToMarkdown(workItem.description_html);

    await this.issueSource.updateIssue(issueNumber, {
      title: workItem.name,
      body,
    });
  }

  async onIssueCreated(issue: Issue): Promise<void> {
    if (!this.client || !this.config) return;

    // 检查是否有 plane-sync 标签
    if (!issue.labels.includes('plane-sync')) {
      return;
    }

    console.log('[Plane Sync] Issue created in Kanbots, syncing to Plane...');

    try {
      const projectId = this.getFirstProjectId();
      if (!projectId) {
        console.error('[Plane Sync] No project configured');
        return;
      }

      const workItem = await this.client.createWorkItem(projectId, {
        name: issue.title,
        description_html: markdownToHtml(issue.body || ''),
        priority: 'none',
      });

      // 创建映射
      this.createMapping(workItem.id, issue.number, workItem);

      console.log('[Plane Sync] Created Plane work item:', workItem.id, workItem.sequence_id);
    } catch (error) {
      console.error('[Plane Sync] Error creating work item:', error);
    }
  }

  async onAgentComplete(run: any, store: Store): Promise<void> {
    if (!this.client || !this.config) return;

    // 获取对应的 Plane Issue
    const db = (store as any).db as Database;
    const mapping = db
      .prepare('SELECT * FROM plane_sync_mapping WHERE kanbots_number = ?')
      .get(run.issueNumber) as PlaneSyncMapping | undefined;

    if (!mapping) return;

    try {
      const comment = this.generateAgentReportComment(run);
      const projectId = this.getFirstProjectId();
      if (!projectId) {
        console.error('[Plane Sync] No project configured');
        return;
      }

      await this.client.addComment(projectId, mapping.plane_id, {
        html: comment,
      });

      console.log('[Plane Sync] Agent completion reported to Plane');
    } catch (error) {
      console.error('[Plane Sync] Error reporting agent completion:', error);
    }
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

  private createMapping(
    planeId: string,
    kanbotsNumber: number,
    workItem: PlaneWorkItem
  ): void {
    const db = (this.store as any).db as Database;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO plane_sync_mapping
      (plane_id, plane_sequence_id, kanbots_number, source, plane_status, kanbots_status, last_synced_at)
      VALUES (?, ?, ?, 'kanbots', ?, ?, ?)
    `).run(planeId, workItem.sequence_id, kanbotsNumber, 'todo', 'open', now);
  }

  private updateMapping(
    planeId: string,
    kanbotsNumber: number,
    workItem: PlaneWorkItem
  ): void {
    const db = (this.store as any).db as Database;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE plane_sync_mapping
      SET plane_status = ?, last_synced_at = ?
      WHERE plane_id = ? AND kanbots_number = ?
    `).run('in-progress', now, planeId, kanbotsNumber);
  }

  private async updateLastSyncedAt(): Promise<void> {
    const db = (this.store as any).db as Database;
    const now = new Date().toISOString();

    db.prepare('UPDATE plane_sync_config SET last_synced_at = ? WHERE id = 1').run(now);
  }

  private async updateLastError(error: string): Promise<void> {
    const db = (this.store as any).db as Database;

    db.prepare('UPDATE plane_sync_config SET last_error = ? WHERE id = 1').run(error);
  }
}

function htmlToMarkdown(html: string): string {
  if (!html) return '';
  // 一次性替换所有 HTML 标签，避免多次遍历
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
  // 按照优先级顺序替换，避免重复处理
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
