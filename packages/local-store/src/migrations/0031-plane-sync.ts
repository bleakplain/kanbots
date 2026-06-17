import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0031_plane_sync',
  up: `
    -- 添加全局 ID 和 Plane 同步字段
    ALTER TABLE local_issues ADD COLUMN id TEXT NOT NULL UNIQUE;
    ALTER TABLE local_issues ADD COLUMN plane_workitem_id TEXT UNIQUE;
    ALTER TABLE local_issues ADD COLUMN plane_synced_at TEXT;

    -- 创建索引
    CREATE INDEX idx_local_issues_id ON local_issues(id);
    CREATE INDEX idx_local_issues_plane_workitem_id ON local_issues(plane_workitem_id) WHERE plane_workitem_id IS NOT NULL;

    -- 为现有 issues生成全局 ID
    UPDATE local_issues
    SET id = author_login || '-' || lower(hex(randomblob(16)))
    WHERE id IS NULL;

    -- 创建 Plane 同步配置表
    CREATE TABLE plane_sync_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      api_url TEXT NOT NULL DEFAULT 'http://localhost:8000',
      api_key TEXT,
      workspace_slug TEXT NOT NULL,
      project_ids TEXT NOT NULL DEFAULT '[]',
      user_uuid TEXT,
      poll_interval_seconds INTEGER NOT NULL DEFAULT 60,
      last_synced_at TEXT,
      last_error TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 插入默认配置
    INSERT INTO plane_sync_config (id, api_url, workspace_slug, project_ids, created_at, updated_at)
    VALUES (1, 'http://localhost:8000', '', '[]', datetime('now'), datetime('now'));
  `,
};