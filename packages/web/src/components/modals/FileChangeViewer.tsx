import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { api } from '../../api.js';
import { getBridge } from '../../desktop-bridge.js';
import { InlineDiff } from '../run/InlineDiff.js';

/**
 * Per-file change viewer. Opens when the user clicks a touched file in
 * the WorkspaceTree. Shows the worktree's diff against HEAD and, if the
 * worktree was created by an agent run (.kanbots/worktrees/issue-N-R),
 * surfaces the originating task and a reply form that posts to that
 * task's thread.
 *
 * The user cannot edit files here — we deliberately leave that surface
 * out for now. The intent is "review what the agent did + talk to it",
 * not "open an editor".
 */

export interface FileChangeViewerProps {
  filePath: string;
  worktrees: string[];
  onClose: () => void;
}

type StatusCode = 'M' | 'A' | 'D' | 'R' | '??' | 'U' | null;

interface DiffPayload {
  status: StatusCode;
  oldText: string | null;
  newText: string | null;
}

interface DiffViewState {
  loading: boolean;
  data: DiffPayload | null;
  error: string | null;
}

/**
 * `.kanbots/worktrees/issue-<n>-<r>` is the convention used by the
 * local supervisor (`defaultWorktreePath` in @kanbots/dispatcher). The
 * cloud dispatcher currently runs in the bound repo directly so cloud-
 * mode worktrees won't match this pattern — that's fine; the modal
 * just renders the diff without a task link.
 */
function parseWorktreeContext(
  worktreePath: string,
): { issueNumber: number; runId: number } | null {
  const m = /\.kanbots\/worktrees\/issue-(\d+)-(\d+)\/?$/.exec(worktreePath);
  if (m === null) return null;
  const issueNumber = Number.parseInt(m[1] ?? '', 10);
  const runId = Number.parseInt(m[2] ?? '', 10);
  if (!Number.isFinite(issueNumber) || !Number.isFinite(runId)) return null;
  return { issueNumber, runId };
}

function statusLabel(status: StatusCode): string {
  switch (status) {
    case 'M':
      return 'Modified';
    case 'A':
      return 'Added';
    case 'D':
      return 'Deleted';
    case 'R':
      return 'Renamed';
    case '??':
      return 'Untracked';
    case 'U':
      return 'Conflict';
    default:
      return 'Clean';
  }
}

interface WorktreeDiffProps {
  worktreePath: string;
  filePath: string;
  onMessageSent?: () => void;
}

function WorktreeDiff({ worktreePath, filePath, onMessageSent }: WorktreeDiffProps) {
  const [state, setState] = useState<DiffViewState>({
    loading: true,
    data: null,
    error: null,
  });
  const ctx = parseWorktreeContext(worktreePath);
  const [reply, setReply] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    void bridge
      .workspaceFileDiff({ worktreePath, filePath })
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [worktreePath, filePath]);

  const sendReply = useCallback(async () => {
    if (ctx === null) return;
    const body = reply.trim();
    if (body.length === 0 || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      // postMessage already cloud-routes via cloudCommentsAdd in cloud
      // mode and goes through issues:post-message locally — same fn,
      // works for both surfaces.
      await api.postMessage(ctx.issueNumber, body, { dispatch: false });
      setReply('');
      setPosted(true);
      onMessageSent?.();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  }, [ctx, reply, posting, onMessageSent]);

  const worktreeLabel = worktreePath.split('/').pop() ?? worktreePath;

  return (
    <section className="kb-fcv-worktree">
      <header className="kb-fcv-worktree-head">
        <div className="kb-fcv-worktree-title">
          <span className="kb-fcv-worktree-glyph" aria-hidden>
            {ctx === null ? '◯' : '◇'}
          </span>
          {ctx === null ? (
            <span>{worktreeLabel}</span>
          ) : (
            <span>
              <strong>#{ctx.issueNumber}</strong> · run {ctx.runId}
              <span className="kb-fcv-worktree-sub">  ({worktreeLabel})</span>
            </span>
          )}
        </div>
        <div className="kb-fcv-worktree-status">{statusLabel(state.data?.status ?? null)}</div>
      </header>

      <div className="kb-fcv-diff-wrap">
        {state.loading ? (
          <div className="kb-fcv-empty">Loading diff…</div>
        ) : state.error !== null ? (
          <div className="kb-fcv-empty kb-fcv-err">{state.error}</div>
        ) : state.data === null || (state.data.oldText === null && state.data.newText === null) ? (
          <div className="kb-fcv-empty">No diff data available.</div>
        ) : (
          <InlineDiff
            oldString={state.data.oldText ?? ''}
            newString={state.data.newText ?? ''}
          />
        )}
      </div>

      {ctx !== null ? (
        <div className="kb-fcv-reply">
          <label className="kb-fcv-reply-label">Talk to the agent that made this change</label>
          <textarea
            className="kb-fcv-reply-text"
            placeholder={`Reply to thread for #${ctx.issueNumber}…`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            disabled={posting}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void sendReply();
              }
            }}
          />
          <div className="kb-fcv-reply-foot">
            {postError ? <span className="kb-fcv-err">{postError}</span> : null}
            {posted && reply.length === 0 ? (
              <span className="kb-fcv-ok">Sent.</span>
            ) : null}
            <span className="kb-fcv-hint">⌘⏎ to send</span>
            <button
              type="button"
              className="kb-btn primary"
              onClick={() => void sendReply()}
              disabled={posting || reply.trim().length === 0}
            >
              {posting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      ) : (
        <div className="kb-fcv-reply kb-fcv-reply-disabled">
          <span className="kb-fcv-hint">
            This change is in the main worktree, not tied to an agent run — no
            thread to reply to.
          </span>
        </div>
      )}
    </section>
  );
}

export function FileChangeViewer({ filePath, worktrees, onClose }: FileChangeViewerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  return (
    <div className="kb-modal-scrim" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="kb-modal kb-modal-fcv" onMouseDown={stopInner}>
        <div className="kb-modal-head">
          <h2 className="kb-fcv-title">
            <span className="kb-fcv-file" title={filePath}>{filePath}</span>
          </h2>
          <span className="grow" />
          <button type="button" className="x-btn" onClick={onClose} aria-label="Close" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>
        <div className="kb-modal-body kb-fcv-body">
          {worktrees.length === 0 ? (
            <div className="kb-fcv-empty">
              No worktree carries an uncommitted change for this file right now.
            </div>
          ) : (
            worktrees.map((wt) => (
              <WorktreeDiff key={wt} worktreePath={wt} filePath={filePath} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
