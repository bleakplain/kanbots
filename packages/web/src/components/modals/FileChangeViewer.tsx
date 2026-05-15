import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { api, getCloudCtx } from '../../api.js';
import { getBridge } from '../../desktop-bridge.js';
import { InlineDiff } from '../run/InlineDiff.js';

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'stopped', 'timed_out']);

function isActiveStatus(status: string): boolean {
  return !TERMINAL_RUN_STATUSES.has(status);
}

/**
 * Snapshot of the most recent thread context (card body + N most recent
 * comments) used to feed a restarted agent so it can pick up where the
 * previous run left off. The cloud CLI doesn't read cloud comments
 * itself, so we splice them into `appendSystemPrompt` at restart time.
 */
const RESTART_CONTEXT_COMMENT_LIMIT = 12;

async function buildRestartContext(
  orgSlug: string,
  projectSlug: string,
  issueNumber: number,
): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  try {
    const card = await bridge.cloudCardsGet({ orgSlug, projectSlug, number: issueNumber });
    const commentsResp = await bridge.cloudCommentsList({
      orgSlug,
      projectSlug,
      number: issueNumber,
    });
    const lines: string[] = [];
    lines.push(`This is a continuation of task #${issueNumber}: ${card.title}`);
    if (card.body) {
      lines.push('', 'Task description:', card.body);
    }
    const recent = commentsResp.data.slice(-RESTART_CONTEXT_COMMENT_LIMIT);
    if (recent.length > 0) {
      lines.push('', 'Recent thread (oldest first):');
      for (const c of recent) {
        lines.push(`---`);
        lines.push(c.body);
      }
    }
    lines.push('', 'Continue from the latest message in the thread.');
    return lines.join('\n');
  } catch {
    return null;
  }
}

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
 * `.kanbots/worktrees/issue-<n>-<r>` is the convention used by both
 * the local supervisor (`defaultWorktreePath` in @kanbots/dispatcher,
 * numeric runId) and the cloud dispatcher (last-10-chars of the
 * KSUID, alphanumeric). The regex accepts both shapes; the caller
 * treats runId as opaque.
 */
function parseWorktreeContext(
  worktreePath: string,
): { issueNumber: number; runId: string } | null {
  const m = /\.kanbots\/worktrees\/issue-(\d+)-([A-Za-z0-9]+)\/?$/.exec(worktreePath);
  if (m === null) return null;
  const issueNumber = Number.parseInt(m[1] ?? '', 10);
  const runId = m[2] ?? '';
  if (!Number.isFinite(issueNumber) || runId.length === 0) return null;
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
  const cloudCtx = getCloudCtx();
  const [reply, setReply] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  /** null = unknown / not-yet-loaded; boolean = resolved. */
  const [hasActiveRun, setHasActiveRun] = useState<boolean | null>(null);

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

  // Probe the cloud for an active run on this task so the reply form
  // can offer "Send & restart agent" when the prior run has finished.
  // Only meaningful in cloud mode — local mode keeps the comment-only
  // path because the local supervisor handles dispatch itself.
  useEffect(() => {
    if (ctx === null || cloudCtx === null) {
      setHasActiveRun(null);
      return;
    }
    const bridge = getBridge();
    if (!bridge) return;
    let cancelled = false;
    void bridge
      .cloudRunsListForCard({
        orgSlug: cloudCtx.orgSlug,
        projectSlug: cloudCtx.projectSlug,
        number: ctx.issueNumber,
      })
      .then((resp) => {
        if (cancelled) return;
        setHasActiveRun(resp.data.some((r) => isActiveStatus(r.status)));
      })
      .catch(() => {
        if (!cancelled) setHasActiveRun(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, cloudCtx]);

  const send = useCallback(
    async (action: 'send' | 'send-restart') => {
      if (ctx === null) return;
      const body = reply.trim();
      if (body.length === 0 || posting) return;
      setPosting(true);
      setPostError(null);
      try {
        await api.postMessage(ctx.issueNumber, body, { dispatch: false });
        if (action === 'send-restart' && cloudCtx !== null) {
          const bridge = getBridge();
          if (bridge !== null) {
            const context = await buildRestartContext(
              cloudCtx.orgSlug,
              cloudCtx.projectSlug,
              ctx.issueNumber,
            );
            await bridge.cloudStartAgentRun({
              orgSlug: cloudCtx.orgSlug,
              projectSlug: cloudCtx.projectSlug,
              number: ctx.issueNumber,
              prompt: body,
              ...(context !== null ? { appendSystemPrompt: context } : {}),
            });
            setHasActiveRun(true);
          }
        }
        setReply('');
        setPosted(true);
        onMessageSent?.();
      } catch (err) {
        setPostError(err instanceof Error ? err.message : String(err));
      } finally {
        setPosting(false);
      }
    },
    [ctx, reply, posting, cloudCtx, onMessageSent],
  );

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
          <label className="kb-fcv-reply-label">
            Talk to the agent that made this change
            {hasActiveRun === false ? (
              <span className="kb-fcv-reply-hint-inline">
                {' '}— prior run has ended
              </span>
            ) : null}
          </label>
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
                // Default keyboard action picks the most useful one:
                // restart agent if there isn't a live one, else just send.
                const action = hasActiveRun === false ? 'send-restart' : 'send';
                void send(action);
              }
            }}
          />
          <div className="kb-fcv-reply-foot">
            {postError ? <span className="kb-fcv-err">{postError}</span> : null}
            {posted && reply.length === 0 ? (
              <span className="kb-fcv-ok">Sent.</span>
            ) : null}
            <span className="kb-fcv-hint">⌘⏎ to send</span>
            {/* In cloud mode with no live run, expose the restart path
                explicitly so the user knows the comment will spawn a
                fresh agent. Comment-only "Send" stays available so
                they can leave a note without dispatching. */}
            {cloudCtx !== null && hasActiveRun === false ? (
              <>
                <button
                  type="button"
                  className="kb-btn"
                  onClick={() => void send('send')}
                  disabled={posting || reply.trim().length === 0}
                  title="Post the comment without starting a new agent run."
                >
                  Send only
                </button>
                <button
                  type="button"
                  className="kb-btn primary"
                  onClick={() => void send('send-restart')}
                  disabled={posting || reply.trim().length === 0}
                  title="Post the comment and start a new agent run that picks up the thread."
                >
                  {posting ? 'Restarting…' : 'Send & restart agent'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="kb-btn primary"
                onClick={() => void send('send')}
                disabled={posting || reply.trim().length === 0}
              >
                {posting ? 'Sending…' : 'Send'}
              </button>
            )}
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
