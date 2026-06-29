import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0032_update_plane_sync_encryption',
  up: `
    -- 添加API Key加密字段
    ALTER TABLE plane_sync_config ADD COLUMN api_key_encrypted BLOB;
    ALTER TABLE plane_sync_config ADD COLUMN api_key_encryption TEXT NOT NULL DEFAULT 'plain';

    -- 迁移现有API Key到加密字段（如果存在）
    UPDATE plane_sync_config
    SET api_key_encrypted = CAST(api_key AS BLOB),
        api_key_encryption = 'plain'
    WHERE api_key IS NOT NULL;

    -- 注意：保留旧的api_key字段作为备份，后续可以删除
    -- 现在plane-sync.ts会优先使用api_key_encrypted字段
  `,
};