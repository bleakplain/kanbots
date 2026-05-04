import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { CostBreakdownItem } from '../types.js';

export interface StatsProps {
  onClose?: () => void;
}

export function Stats({ onClose }: StatsProps) {
  const [breakdown, setBreakdown] = useState<CostBreakdownItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.costBreakdown()
      .then(setBreakdown)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="kb-modal-backdrop" onClick={onClose}>
      <div className="kb-modal kb-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kb-modal-header">
          <h2>Token Cost Tracking</h2>
          {onClose && (
            <button type="button" className="kb-modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
        <div className="kb-modal-body">
          <p className="kb-settings-desc">
            Aggregated token cost visualization per workspace and provider.
          </p>
          
          {error ? (
            <div className="kb-error-banner">{error}</div>
          ) : !breakdown ? (
            <div style={{ padding: 20, color: 'var(--ink-2)' }}>Loading cost breakdown...</div>
          ) : breakdown.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--ink-2)' }}>No cost data available yet.</div>
          ) : (
            <table className="kb-table" style={{ width: '100%', textAlign: 'left', marginTop: 16 }}>
              <thead>
                <tr>
                  <th style={{ paddingBottom: 8, borderBottom: '1px solid var(--hairline)' }}>Workspace</th>
                  <th style={{ paddingBottom: 8, borderBottom: '1px solid var(--hairline)' }}>Provider</th>
                  <th style={{ paddingBottom: 8, borderBottom: '1px solid var(--hairline)', textAlign: 'right' }}>Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((item, i) => (
                  <tr key={`${item.workspace}-${item.provider}-${i}`}>
                    <td style={{ paddingTop: 8, color: 'var(--ink)' }}>{item.workspace}</td>
                    <td style={{ paddingTop: 8, color: 'var(--ink-2)' }}>{item.provider}</td>
                    <td style={{ paddingTop: 8, textAlign: 'right', fontWeight: 500 }}>
                      ${item.totalUsd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
