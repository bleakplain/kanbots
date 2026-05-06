import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { getBridge } from '../../desktop-bridge.js';
import type {
  AgentRunSummary,
  CardStatus,
  CardSummary,
  CommentSummary,
} from '@kanbots/cloud-client';

export interface CloudCardModalProps {
  orgSlug: string;
  projectSlug: string;
  cardNumber: number;
  /**
   * Pinned local repo for this project (Option C). When null, the
   * agent dispatch flow surfaces a clear "bind a repo first"
   * message instead of creating a run that has nowhere to execute.
   */
  boundRepo: string | null;
  onClose: () => void;
  onChanged: () => void;
}

const STATUS_OPTIONS: CardStatus[] = [
  'inbox',
  'backlog',
  'ready',
  'in_progress',
  'review',
  'done',
  'blocked',
];

interface State {
  loading: boolean;
  error: string | null;
  card: CardSummary | null;
  comments: CommentSummary[];
  runs: AgentRunSummary[];
}

export function CloudCardModal({
  orgSlug,
  projectSlug,
  cardNumber,
  boundRepo,
  onClose,
  onChanged,
}: CloudCardModalProps) {
  const [state, setState] = useState<State>({
    loading: true,
    error: null,
    card: null,
    comments: [],
    runs: [],
  });
  const [draftComment, setDraftComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<
    Array<{ id: string; event: string; data: unknown }>
  >([]);
  const [streamError, setStreamError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const bridge = getBridge();
    if (!bridge) {
      setState((s) => ({ ...s, loading: false, error: 'Desktop bridge unavailable.' }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const list = await bridge.cloudCardsList({
        orgSlug,
        projectSlug,
        query: { limit: 100 },
      });
      const card = list.data.find((c) => c.number === cardNumber) ?? null;
      if (card === null) throw new Error(`Card #${cardNumber} not found`);
      const [comments, runs] = await Promise.all([
        bridge.cloudCommentsList({ orgSlug, projectSlug, number: cardNumber }),
        bridge.cloudRunsListForCard({ orgSlug, projectSlug, number: cardNumber }),
      ]);
      setState({
        loading: false,
        error: null,
        card,
        comments: comments.data,
        runs: runs.data,
      });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        card: null,
        comments: [],
        runs: [],
      });
    }
  }, [orgSlug, projectSlug, cardNumber]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Live event stream for the selected run. Subscribes via the IPC
  // bridge — main process holds the SSE connection and forwards each
  // server-sent event back as a `kanbots:cloud:run-event` message.
  useEffect(() => {
    if (selectedRunId === null) return;
    const bridge = getBridge();
    if (!bridge) return;
    let active = true;
    let activeSubscriptionId: string | null = null;
    setStreamEvents([]);
    setStreamError(null);

    const unsub = bridge.subscribe('kanbots:cloud:run-event', (payload) => {
      if (!active) return;
      const msg = payload as
        | {
            subscriptionId: string;
            event?: { id: string; event: string; data: unknown };
            error?: string;
            done?: boolean;
          }
        | null;
      if (!msg || msg.subscriptionId !== activeSubscriptionId) return;
      if (typeof msg.error === 'string') {
        setStreamError(msg.error);
        return;
      }
      if (msg.done === true) return;
      if (msg.event !== undefined) {
        setStreamEvents((prev) => [...prev, msg.event!].slice(-200));
      }
    });

    void bridge
      .cloudRunsStreamStart({
        orgSlug,
        projectSlug,
        runId: selectedRunId,
      })
      .then((result) => {
        if (!active) {
          void bridge.cloudRunsStreamStop(result.subscriptionId);
          return;
        }
        activeSubscriptionId = result.subscriptionId;
      })
      .catch((err: unknown) => {
        setStreamError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      active = false;
      unsub();
      if (activeSubscriptionId !== null) {
        void bridge.cloudRunsStreamStop(activeSubscriptionId);
      }
    };
  }, [selectedRunId, orgSlug, projectSlug]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  async function changeStatus(next: CardStatus): Promise<void> {
    const bridge = getBridge();
    if (!bridge || state.card === null) return;
    setSavingStatus(true);
    try {
      await bridge.cloudCardsUpdate({
        orgSlug,
        projectSlug,
        number: cardNumber,
        body: { status: next },
      });
      onChanged();
      await refresh();
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setSavingStatus(false);
    }
  }

  async function postComment(): Promise<void> {
    if (draftComment.trim().length === 0) return;
    const bridge = getBridge();
    if (!bridge) return;
    setPosting(true);
    try {
      await bridge.cloudCommentsAdd({
        orgSlug,
        projectSlug,
        number: cardNumber,
        body: draftComment.trim(),
      });
      setDraftComment('');
      onChanged();
      await refresh();
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setPosting(false);
    }
  }

  async function dispatchRun(): Promise<void> {
    if (boundRepo === null) {
      setState((s) => ({
        ...s,
        error:
          'Bind a local repo to this project from the toolbar (top of the board) before dispatching an agent.',
      }));
      return;
    }
    const bridge = getBridge();
    if (!bridge) return;
    setDispatching(true);
    try {
      await bridge.cloudRunsCreate({
        orgSlug,
        projectSlug,
        number: cardNumber,
        body: {},
      });
      onChanged();
      await refresh();
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div
      className="kb-modal-scrim"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="kb-modal"
        onMouseDown={stopInner}
        style={{ maxWidth: 720, width: '90%' }}
      >
        <div className="kb-modal-head">
          <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>#{cardNumber}</span>
          <h2 style={{ marginLeft: 8 }}>{state.card?.title ?? '…'}</h2>
          <span className="grow" />
          <button
            type="button"
            className="x-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="kb-modal-body" style={{ display: 'grid', gap: 16 }}>
          {state.loading ? <div>Loading…</div> : null}
          {state.error ? (
            <div className="kb-sentry-error" role="alert">
              {state.error}
            </div>
          ) : null}

          {state.card ? (
            <>
              <section>
                <label style={{ fontSize: 12, color: 'var(--ink-3)' }}>Status</label>
                <select
                  value={state.card.status}
                  disabled={savingStatus}
                  onChange={(e) => void changeStatus(e.target.value as CardStatus)}
                  style={{
                    display: 'block',
                    marginTop: 4,
                    padding: '6px 8px',
                    border: '1px solid var(--hairline-soft)',
                    borderRadius: 6,
                    background: 'transparent',
                    color: 'var(--ink)',
                  }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </section>

              <section>
                <h3 style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 6 }}>
                  Description
                </h3>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    color: 'var(--ink-2)',
                    fontSize: 13,
                    margin: 0,
                  }}
                >
                  {state.card.body || '(no description)'}
                </pre>
              </section>

              <section>
                <h3 style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 6 }}>
                  Comments ({state.comments.length})
                </h3>
                {state.comments.length === 0 ? (
                  <p style={{ color: 'var(--ink-3)', fontSize: 12, margin: '4px 0 8px' }}>
                    No comments yet.
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: '0 0 12px 0',
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    {state.comments.map((c) => (
                      <li
                        key={c.id}
                        style={{
                          padding: 10,
                          border: '1px solid var(--hairline-soft)',
                          borderRadius: 6,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            marginBottom: 4,
                          }}
                        >
                          user {c.author_user_id} ·{' '}
                          {new Date(c.created_at).toLocaleString()}
                          {c.edited_at !== null ? ' (edited)' : ''}
                        </div>
                        <pre
                          style={{
                            whiteSpace: 'pre-wrap',
                            margin: 0,
                            color: 'var(--ink)',
                            fontSize: 13,
                          }}
                        >
                          {c.body}
                        </pre>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={draftComment}
                  onChange={(e) => setDraftComment(e.target.value)}
                  placeholder="Add a comment…"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: 8,
                    border: '1px solid var(--hairline-soft)',
                    borderRadius: 6,
                    background: 'transparent',
                    color: 'var(--ink)',
                    fontSize: 13,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                  <button
                    type="button"
                    className="kb-btn primary"
                    onClick={() => void postComment()}
                    disabled={posting || draftComment.trim().length === 0}
                  >
                    {posting ? 'Posting…' : 'Post comment'}
                  </button>
                </div>
              </section>

              <section>
                <h3 style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 6 }}>
                  Runs ({state.runs.length})
                </h3>
                {state.runs.length === 0 ? (
                  <p style={{ color: 'var(--ink-3)', fontSize: 12, margin: '4px 0 8px' }}>
                    No runs yet.
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: '0 0 12px 0',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    {state.runs.map((r) => {
                      const isSelected = r.id === selectedRunId;
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedRunId((cur) => (cur === r.id ? null : r.id))
                            }
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: 8,
                              border: '1px solid var(--hairline-soft)',
                              borderRadius: 6,
                              background: isSelected
                                ? 'var(--surface-2, rgba(0,0,0,0.04))'
                                : 'transparent',
                              color: 'var(--ink)',
                              cursor: 'pointer',
                              display: 'flex',
                              gap: 12,
                              fontSize: 12,
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ color: 'var(--ink-2)' }}>{r.cli}</span>
                            <span style={{ color: 'var(--ink-3)' }}>{r.model}</span>
                            <span
                              style={{
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: 'var(--surface-2, rgba(0,0,0,0.04))',
                                color: 'var(--ink-2)',
                                fontFamily: 'ui-monospace, monospace',
                                fontSize: 11,
                              }}
                            >
                              {r.status}
                            </span>
                            <span
                              style={{ color: 'var(--ink-3)', flex: 1, textAlign: 'right' }}
                            >
                              {new Date(r.started_at).toLocaleString()}
                            </span>
                            <span style={{ color: 'var(--ink-3)' }}>
                              {isSelected ? '▾' : '▸'}
                            </span>
                          </button>
                          {isSelected ? (
                            <div
                              style={{
                                marginTop: 6,
                                marginBottom: 8,
                                padding: 10,
                                border: '1px solid var(--hairline-soft)',
                                borderRadius: 6,
                                background: 'var(--surface-2, rgba(0,0,0,0.02))',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'var(--ink-3)',
                                  marginBottom: 6,
                                }}
                              >
                                Live events ({streamEvents.length})
                                {streamError !== null ? ` — ${streamError}` : ''}
                              </div>
                              {streamEvents.length === 0 ? (
                                <div
                                  style={{ color: 'var(--ink-3)', fontSize: 12 }}
                                >
                                  Waiting for events…
                                </div>
                              ) : (
                                <pre
                                  style={{
                                    margin: 0,
                                    fontFamily: 'ui-monospace, monospace',
                                    fontSize: 11,
                                    color: 'var(--ink-2)',
                                    whiteSpace: 'pre-wrap',
                                    maxHeight: 240,
                                    overflow: 'auto',
                                  }}
                                >
                                  {streamEvents
                                    .map((ev) =>
                                      `[${ev.event}] ${
                                        typeof ev.data === 'string'
                                          ? ev.data
                                          : JSON.stringify(ev.data)
                                      }`,
                                    )
                                    .join('\n')}
                                </pre>
                              )}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <button
                  type="button"
                  className="kb-btn primary"
                  onClick={() => void dispatchRun()}
                  disabled={dispatching}
                >
                  {dispatching ? 'Dispatching…' : 'Dispatch agent'}
                </button>
              </section>
            </>
          ) : null}
        </div>

        <div className="kb-modal-foot">
          <span className="hint" />
          <button type="button" className="kb-btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
