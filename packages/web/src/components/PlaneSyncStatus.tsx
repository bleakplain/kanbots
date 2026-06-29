import React, { useState, useEffect } from 'react';

interface PlaneSyncStatusProps {
  className?: string;
}

interface SyncStatus {
  enabled: boolean;
  configured: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export function PlaneSyncStatus({ className = '' }: PlaneSyncStatusProps) {
  const [status, setStatus] = useState<SyncStatus>({
    enabled: false,
    configured: false,
    lastSyncedAt: null,
    lastError: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 获取同步状态
    const fetchStatus = async () => {
      try {
        const result = await window.electron.invoke('plane-sync:get-status');
        setStatus(result);
      } catch (error) {
        console.error('Failed to fetch Plane sync status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    // 每30秒刷新一次状态
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className={`plane-sync-status loading ${className}`}>
        <span className="status-indicator">⏳</span>
        <span className="status-text">加载中...</span>
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className={`plane-sync-status not-configured ${className}`}>
        <span className="status-indicator">⚙️</span>
        <span className="status-text">Plane同步未配置</span>
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className={`plane-sync-status disabled ${className}`}>
        <span className="status-indicator">⏸️</span>
        <span className="status-text">Plane同步已禁用</span>
      </div>
    );
  }

  if (status.lastError) {
    return (
      <div className={`plane-sync-status error ${className}`}>
        <span className="status-indicator">❌</span>
        <span className="status-text">同步失败: {status.lastError}</span>
      </div>
    );
  }

  const lastSyncText = status.lastSyncedAt
    ? `最后同步: ${new Date(status.lastSyncedAt).toLocaleString()}`
    : '等待同步...';

  return (
    <div className={`plane-sync-status success ${className}`}>
      <span className="status-indicator">✅</span>
      <span className="status-text">{lastSyncText}</span>
    </div>
  );
}