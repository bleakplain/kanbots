import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../../api.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useAgentRunStream } from '../../hooks/useAgentRunStream.js';
import { ageString, areaLabels, colorForLogin, tagFromLabels } from '../../labels.js';
import { RunSummary } from '../run/RunSummary.js';
import { PreviewPanel } from '../run/PreviewPanel.js';
import type {
  AgentEvent,
  AgentRun,
  AgentRunStatus,
  Card,
  DecisionPayload,
  DiffFile,
  DiffPayload,
  Issue,
  IssueDetail,
} from '../../types.js';

function isActive(status: AgentRunStatus): boolean {
  return status === 'starting' || status === 'running' || status === 'awaiting_input';
}

type InspectorTab = 'thread' | 'diff' | 'preview';

export interface InspectorProps {
  selectedNumber: number | null;
  onExpand?: (n: number) => void;
}

export function Inspector({ selectedNumber, onExpand }: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('thread');

  if (selectedNumber === null) {
    return (
      <div className="kb-inspector">
        <div className="kb-insp-empty">Select a card to inspect</div>
      </div>
    );
  }

  return (
    <InspectorBody
      key={selectedNumber}
      issueNumber={selectedNumber}
      tab={tab}
      onTab={setTab}
      onExpand={() => onExpand?.(selectedNumber)}
    />
  );
}

function InspectorBody({
  issueNumber,
  tab,
  onTab,
  onExpand,
}: {
  issueNumber: number;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  onExpand: () => void;
}) {
  const { data, loading, error, mutate } = useFetch<IssueDetail>(`issue:${issueNumber}`, () =>
    api.issue(issueNumber),
  );

  if (loading && !data) {
    return (
      <div className="kb-inspector">
        <div className="kb-insp-empty">Loading #{issueNumber}…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="kb-inspector">
        <div className="kb-insp-empty" style={{ color: 'var(--failed)' }}>
          {error?.message ?? 'No data'}
        </div>
      </div>
    );
  }

  const { issue, thread } = data;
  const activeRun = thread?.activeRun ?? null;
  const branch = activeRun?.branchName ?? issue.activeRun?.branch ?? null;

  return (
    <div className="kb-inspector">
      <div className="kb-insp-bar">
        <span className="kb-insp-num">#{issue.number}</span>
        <span className="kb-insp-sep">·</span>
        <span className="kb-insp-branch">{branch ?? 'no branch'}</span>
        <div className="kb-insp-tabs">
          <button
            type="button"
            className="kb-insp-tab kb-expand"
            onClick={onExpand}
            title="Expand to full detail"
          >
            ↗ Expand
          </button>
          <button
            type="button"
            className={`kb-insp-tab${tab === 'thread' ? ' active' : ''}`}
            onClick={() => onTab('thread')}
          >
            Thread
          </button>
          <button
            type="button"
            className={`kb-insp-tab${tab === 'diff' ? ' active' : ''}`}
            onClick={() => onTab('diff')}
          >
            Diff
          </button>
          <button
            type="button"
            className={`kb-insp-tab${tab === 'preview' ? ' active' : ''}`}
            onClick={() => onTab('preview')}
          >
            Preview
          </button>
        </div>
      </div>

      <div className="kb-insp-body">
        <div className="kb-insp-title-row">
          <span className="kb-insp-title-num">#{issue.number}</span>
          <h1 className="kb-insp-title">{issue.title}</h1>
        </div>
        <div className="kb-insp-meta-row">
          {tagFromLabels(issue.labels, issue.isPullRequest) ? (
            <span className={`kb-tag kb-tag-${tagFromLabels(issue.labels, issue.isPullRequest)}`}>
              {tagFromLabels(issue.labels, issue.isPullRequest)}
            </span>
          ) : null}
          {areaLabels(issue.labels).map((l) => (
            <span key={l} className="kb-chip mono">
              {l}
            </span>
          ))}
          <span className="kb-chip">
            <span className="k">opened</span>
            {issue.user.login} · {ageString(issue.createdAt)}
          </span>
          {issue.assignees.length > 0 ? (
            <span className="kb-chip" style={{ paddingRight: 4 }}>
              <span className="k">on</span>
              {issue.assignees.map((login) => (
                <span
                  key={login}
                  className="kb-av"
                  style={{
                    width: 16,
                    height: 16,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    fontSize: 9,
                    fontWeight: 600,
                    color: 'oklch(0.18 0.02 60)',
                    background: colorForLogin(login),
                    marginLeft: 2,
                  }}
                >
                  {login.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </span>
          ) : null}
        </div>

        {tab === 'thread' ? (
          <ThreadTab
            issueNumber={issue.number}
            description={issue.body}
            activeRun={activeRun}
            issue={issue}
            onRefresh={() => mutate((p) => (p ? { ...p } : p))}
          />
        ) : null}
        {tab === 'diff' ? <DiffTab activeRunId={activeRun?.id ?? null} /> : null}
        {tab === 'preview' ? (
          <PreviewTab
            branch={branch}
            {...(activeRun?.id !== undefined ? { activeRunId: activeRun.id } : {})}
          />
        ) : null}
      </div>
    </div>
  );
}

function ThreadTab({
  issueNumber,
  description,
  activeRun,
  issue,
  onRefresh,
}: {
  issueNumber: number;
  description: string;
  activeRun: AgentRun | null;
  issue: Issue;
  onRefresh: () => void;
}) {
  const stream = useAgentRunStream(activeRun?.id ?? null);
  const status: AgentRunStatus = stream.status ?? activeRun?.status ?? 'complete';
  const decisionCard = stream.cards.find(
    (c): c is Card<DecisionPayload> => c.type === 'decision' && c.status === 'pending',
  );

  return (
    <>
      <div className="kb-section-h">Description</div>
      <div className="kb-body-block">{description || '(no description)'}</div>

      {issue.agent === 'review' || issue.status === 'review' ? (
        <>
          <div className="kb-section-h">Ready for review</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="kb-btn primary"
              onClick={() => void api.approveIssue(issueNumber).then(onRefresh)}
            >
              Approve & merge
            </button>
            <button
              type="button"
              className="kb-btn"
              onClick={() => void api.requestChangesIssue(issueNumber).then(onRefresh)}
            >
              Request changes
            </button>
            <button
              type="button"
              className="kb-btn"
              disabled
              title="Reviewer agent (Phase 12)"
            >
              Run reviewer agent
            </button>
            {activeRun ? (
              <button
                type="button"
                className="kb-btn ghost"
                onClick={() => void api.runAgentRunChecks(activeRun.id)}
              >
                Re-run tests
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {activeRun ? (
        <>
          <div className="kb-section-h">
            Agent run
            <span className="kb-section-actions">
              {isActive(status) && status !== 'awaiting_input' ? (
                <button
                  type="button"
                  className="kb-btn ghost"
                  style={{ height: 24, padding: '0 8px' }}
                  onClick={() => void api.stopAgent(activeRun.id).then(onRefresh)}
                >
                  Stop
                </button>
              ) : null}
            </span>
          </div>
          <RunSummary run={activeRun} layout="inspector" />
          <div className="kb-run-card" style={{ marginTop: 8 }}>
            <Ticker events={stream.events} />
          </div>

          {decisionCard ? <DecisionView card={decisionCard} /> : null}
        </>
      ) : null}

      <div className="kb-section-h">Reply</div>
      <ReplyComposer issueNumber={issueNumber} onSent={onRefresh} />
    </>
  );
}

const TICKER_CAP = 200;

function Ticker({ events }: { events: AgentEvent[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const truncated = events.length > TICKER_CAP ? events.slice(-TICKER_CAP) : events;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [truncated.length]);

  return (
    <div
      ref={ref}
      className="kb-ticker"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {events.length > TICKER_CAP ? (
        <div style={{ padding: '4px 14px', fontSize: 11, color: 'var(--ink-3)' }}>
          {events.length - TICKER_CAP} earlier events…
        </div>
      ) : null}
      {events.length === 0 ? (
        <div style={{ padding: '6px 14px', color: 'var(--ink-3)', fontSize: 12 }}>
          Waiting for first event…
        </div>
      ) : (
        truncated.map((ev) => <TickerRow key={ev.id} event={ev} />)
      )}
    </div>
  );
}

function TickerRow({ event }: { event: AgentEvent }) {
  switch (event.type) {
    case 'text': {
      const text =
        typeof event.payload === 'object' && event.payload !== null && 'text' in event.payload
          ? String((event.payload as { text: unknown }).text ?? '')
          : '';
      return <div className="kb-tev text">{text}</div>;
    }
    case 'tool_use': {
      const p = event.payload as { name?: string; input?: unknown };
      const arg =
        typeof p.input === 'string'
          ? p.input
          : (() => {
              try {
                return JSON.stringify(p.input);
              } catch {
                return '';
              }
            })();
      return (
        <div className="kb-tev tool">
          <span className="arrow" aria-hidden>
            ↗
          </span>
          <span className="name">{p.name ?? 'tool'}</span>
          <span className="arg">{arg}</span>
        </div>
      );
    }
    case 'tool_result': {
      const p = event.payload as { isError?: boolean; content?: unknown };
      const summary =
        typeof p.content === 'string'
          ? p.content
          : (() => {
              try {
                return JSON.stringify(p.content);
              } catch {
                return '(empty)';
              }
            })();
      return (
        <div className={`kb-tev result${p.isError ? ' kb-error' : ''}`}>
          <span className="arrow" aria-hidden>
            ↩
          </span>
          {summary.slice(0, 240)}
        </div>
      );
    }
    case 'error': {
      const p = event.payload as { message?: string };
      return <div className="kb-tev error">error: {p.message ?? 'unknown'}</div>;
    }
  }
}

function DecisionView({ card }: { card: Card<DecisionPayload> }) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isResolved = card.status === 'resolved';

  async function pick(value: string): Promise<void> {
    if (isResolved || submitting !== null) return;
    setSubmitting(value);
    setError(null);
    try {
      await api.resolveCard(card.id, value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(null);
    }
  }

  return (
    <div className="kb-decision" role="region" aria-label="Agent question">
      <div className="kb-decision-head">
        <div className="ico" aria-hidden>
          ?
        </div>
        Agent paused · awaiting your input
      </div>
      <div className="kb-decision-q">{card.payload.question}</div>
      <div className="kb-decision-opts">
        {card.payload.options.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            className={`kb-decision-opt${submitting === opt.value ? ' chosen' : ''}`}
            disabled={isResolved || submitting !== null}
            onClick={() => void pick(opt.value)}
          >
            <span className="num">{i + 1}</span>
            {opt.label}
          </button>
        ))}
      </div>
      {error ? <div className="kb-decision-resolved-note">error: {error}</div> : null}
    </div>
  );
}

function ReplyComposer({ issueNumber, onSent }: { issueNumber: number; onSent: () => void }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send(): Promise<void> {
    const trimmed = body.trim();
    if (trimmed.length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.postMessage(issueNumber, trimmed);
      setBody('');
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="kb-composer">
      <textarea
        className="kb-composer-input"
        placeholder="Message agent · /spec to refine · /review to spawn reviewer · /split to fan out…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKey}
        disabled={sending}
      />
      <div className="kb-composer-tools">
        <button
          type="button"
          className="slash"
          onClick={() => setBody((s) => `/spec ${s}`.trimEnd())}
          title="Refine acceptance criteria first (Phase 11)"
        >
          /spec
        </button>
        <button
          type="button"
          className="slash"
          onClick={() => setBody((s) => `/review ${s}`.trimEnd())}
          title="Spawn reviewer agent (Phase 11)"
        >
          /review
        </button>
        <button
          type="button"
          className="slash"
          onClick={() => setBody((s) => `/split ${s}`.trimEnd())}
          title="Fan out to sub-agents (Phase 11)"
        >
          /split
        </button>
        <button
          type="button"
          className="slash"
          onClick={() => setBody((s) => `/test ${s}`.trimEnd())}
          title="Run checks (Phase 11)"
        >
          /test
        </button>
        <button
          type="button"
          className="kb-btn primary send"
          onClick={() => void send()}
          disabled={!body.trim() || sending}
        >
          {sending ? 'Sending…' : 'Send'} <span className="kb-kbd">⌘↵</span>
        </button>
      </div>
      {error ? <div className="kb-composer-error">{error}</div> : null}
    </div>
  );
}

function DiffTab({ activeRunId }: { activeRunId: number | null }) {
  const [data, setData] = useState<DiffPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeRunId === null) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getAgentRunDiff(activeRunId)
      .then((p) => {
        if (!cancelled) setData(p);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRunId]);

  if (activeRunId === null) {
    return <div className="kb-diff-empty">No active agent run for this issue yet.</div>;
  }
  if (loading) return <div className="kb-diff-empty">Loading diff…</div>;
  if (error) return <div className="kb-diff-empty" style={{ color: 'var(--failed)' }}>{error}</div>;
  if (!data || data.empty) return <div className="kb-diff-empty">No changes vs. base.</div>;

  return (
    <div className="kb-diff-block">
      <div className="kb-diff-head">
        <span className="branch">{data.branch ?? 'HEAD'}</span>
        <span className="arrow">←</span>
        <span className="branch" style={{ color: 'var(--ink-3)' }}>
          {data.base}
        </span>
        <span className="stat">
          {data.files.length} file{data.files.length === 1 ? '' : 's'}
        </span>
      </div>
      {data.files.map((f) => (
        <DiffFileBlock key={f.path} file={f} />
      ))}
    </div>
  );
}

function DiffFileBlock({ file }: { file: DiffFile }) {
  return (
    <div className="kb-diff-file">
      <div className="kb-diff-fhead">
        <span className={`stat-tag ${file.status}`}>{file.status}</span>
        <span className="path">{file.path}</span>
      </div>
      <div className="kb-diff-hunk">
        {file.patch.split('\n').map((line, idx) => (
          <span key={idx} className={`kb-diff-line ${diffLineClass(line)}`}>
            {line || ' '}
            {'\n'}
          </span>
        ))}
      </div>
    </div>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) return '';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return '';
}

function PreviewTab({ branch, activeRunId }: { branch: string | null; activeRunId?: number }) {
  return (
    <PreviewPanel
      branch={branch}
      {...(activeRunId !== undefined ? { activeRunId } : {})}
      size="compact"
    />
  );
}
