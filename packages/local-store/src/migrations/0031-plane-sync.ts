import type { Migration } from '../types.js';

export const migration: Migration = {
  id: '0031_plane_sync',
  description: 'Add plane_sync_mapping and plane_sync_config tables',
  up: async (db) => {
    // 创建 Plane 同步映射表
    await db.exec(`
      CREATE TABLE plane_sync_mapping (
        plane_id TEXT PRIMARY KEY,
        plane_sequence_id INTEGER,
        kanbots_number INTEGER NOT NULL REFERENCES local_issues(number),
        source TEXT NOT NULL DEFAULT 'plane',
        owner TEXT,
        plane_module TEXT,
        repo_name TEXT,
        plane_status TEXT,
        kanbots_status TEXT,
        last_synced_at TEXT NOT NULL,
        UNIQUE(plane_id, kanbots_number)
      )
    `);

    // 创建 Plane 同步配置表
    await db.exec(`
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
      )
    `);

    // 插入默认配置
    const now = new Date().toISOString();
    await db.run(`
      INSERT INTO plane_sync_config (id, api_url, workspace_slug, project_ids, created_at, updated_at)
      VALUES (1, 'http://localhost:8000', '', '[]', ?, ?)
    `, [now, now]);
  },
  down: async (db) => {
    await db.exec('DROP TABLE IF EXISTS plane_sync_mapping');
    await db.exec('DROP TABLE IF EXISTS plane_sync_config');
  },
};
