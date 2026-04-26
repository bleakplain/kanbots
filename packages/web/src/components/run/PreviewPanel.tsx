import { useEffect, useState } from 'react';
import { api } from '../../api.js';

export interface PreviewPanelProps {
  activeRunId?: number;
  branch: string | null;
  worktreePath?: string | null;
  /** When `compact`, the preview canvas is shorter — use inside a tab pane. */
  size?: 'compact' | 'tall';
}

export function PreviewPanel({
  activeRunId,
  branch,
  worktreePath,
  size = 'compact',
}: PreviewPanelProps) {
  const [state, setState] = useState<{
    url: string | null;
    state: 'idle' | 'booting' | 'live' | 'crashed' | 'stopped';
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRunId) {
      setState(null);
      return;
    }
    let cancelled = false;
    api
      .getAgentRunPreview(activeRunId)
      .then((p) => {
        if (!cancelled) setState({ url: p.url, state: p.state });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeRunId]);

  async function start(): Promise<void> {
    if (!activeRunId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api.startAgentRunPreview(activeRunId);
      setState({ url: p.url, state: p.state });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function stop(): Promise<void> {
    if (!activeRunId || busy) return;
    setBusy(true);
    try {
      const p = await api.stopAgentRunPreview(activeRunId);
      setState({ url: p.url, state: p.state });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const url = state?.url ?? null;
  const isLive = state?.state === 'live' && url;
  const canvasHeight = size === 'tall' ? 360 : 280;

  return (
    <div className="kb-preview-frame" role="region" aria-label="Branch preview">
      <div className="pf-bar">
        <div className="pf-dots" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <div className="pf-url">
          {url ?? `(no preview)`} · {branch ?? '(no worktree)'}
        </div>
        <span style={{ color: state?.state === 'live' ? 'var(--review)' : 'var(--ink-3)' }}>
          {state?.state ?? 'idle'}
        </span>
      </div>
      <div className="pf-canvas" style={{ height: canvasHeight, padding: 0 }}>
        {isLive ? (
          <iframe
            src={url ?? undefined}
            title="Branch preview"
            sandbox="allow-scripts allow-same-origin allow-forms"
            style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
              height: '100%',
            }}
          >
            <div className="lbl" style={{ color: 'var(--ink-2)' }}>
              BRANCH PREVIEW
            </div>
            <div className="lbl" style={{ color: 'var(--ink-3)' }}>
              {worktreePath ? `worktree: ${worktreePath}` : 'no worktree'}
            </div>
            {activeRunId ? (
              <button
                type="button"
                className="kb-btn primary"
                onClick={() => void start()}
                disabled={busy || state?.state === 'booting'}
              >
                {busy
                  ? 'Starting…'
                  : state?.state === 'crashed'
                    ? 'Retry preview'
                    : 'Start preview'}
              </button>
            ) : (
              <div className="lbl" style={{ color: 'var(--ink-4)' }}>
                no active run
              </div>
            )}
            {error ? (
              <div className="kb-composer-error" style={{ marginTop: 8 }}>
                {error}
              </div>
            ) : null}
          </div>
        )}
      </div>
      {isLive ? (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '8px 10px',
            borderTop: '1px solid var(--hairline-soft)',
            background: 'var(--bg)',
          }}
        >
          <button
            type="button"
            className="kb-btn ghost"
            onClick={() => void stop()}
            disabled={busy}
          >
            Stop preview
          </button>
          <button
            type="button"
            className="kb-btn ghost"
            onClick={() => url && window.open(url, '_blank')}
          >
            Open in browser ↗
          </button>
        </div>
      ) : null}
    </div>
  );
}
