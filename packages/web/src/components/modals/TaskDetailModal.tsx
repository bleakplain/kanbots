import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { api } from '../../api.js';
import { useFetch } from '../../hooks/useFetch.js';
import { useIssues, dispatchIssuesRefetch } from '../../hooks/useIssues.js';
import { useAgentRunStream } from '../../hooks/useAgentRunStream.js';
import {
  ageString,
  areaLabels,
  colorForLogin,
  linkedIssueNumbers,
  priorityFromLabels,
  tagFromLabels,
} from '../../labels.js';
import { PreviewPanel } from '../run/PreviewPanel.js';
import { RunSummary } from '../run/RunSummary.js';
import type {
  AgentRun,
  AgentRunStatus,
  DiffFile,
  DiffPayload,
  IssueDetail as IssueDetailPayload,
} from '../../types.js';

const TAB_LABELS: Record<DetailTab, string> = {
  overview: 'Overview',
  thread: 'Thread',
  diff: 'Diff',
  preview: 'Preview',
  runs: 'Runs',
};
type DetailTab = 'overview' | 'thread' | 'diff' | 'preview' | 'runs';

const STATUS_LABEL: Record<AgentRunStatus, string> = {
  starting: 'STARTING',
  running: 'RUNNING',
  awaiting_input: 'AWAITING INPUT',
  complete: 'COMPLETE',
  failed: 'FAILED',
  stopped: 'STOPPED',
};

function fmtElapsed(startIso: string, endIso?: string | null): string {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return '—';
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export interface TaskDetailModalProps {
  issueNumber: number;
  onClose: () => void;
}

export function TaskDetailModal({ issueNumber, onClose }: TaskDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const { data, loading, error, mutate } = useFetch<IssueDetailPayload>(
    `issue:${issueNumber}`,
    () => api.issue(issueNumber),
  );

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  const issue = data?.issue ?? null;
  const activeRun = data?.thread?.activeRun ?? null;
  const isRunning =
    activeRun?.status === 'running' ||
    activeRun?.status === 'awaiting_input' ||
    activeRun?.status === 'starting';

  return (
    <div className="kb-modal-scrim kb-app" onClick={onClose} role="dialog" aria-modal="true">
      <div className="kb-modal" onClick={stopInner}>
        <div className="kb-modal-head">
          <span className="crumb-chip">
            <b>kanbots</b>
          </span>
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <span className="num">#{issueNumber}</span>
          <h2>{issue?.title ?? (loading ? 'Loading…' : 'Issue')}</h2>
          <span className="grow" />
          {activeRun && isRunning ? (
            <button
              type="button"
              className="kb-btn ghost"
              onClick={() => void api.stopAgent(activeRun.id).then(() => mutate((p) => (p ? { ...p } : p)))}
            >
              Stop
            </button>
          ) : null}
          <button type="button" className="kb-btn ghost" disabled title="Phase 11">
            Fork run
          </button>
          {activeRun ? (
            <button type="button" className="kb-btn primary" onClick={() => setTab('preview')}>
              Open preview ↗
            </button>
          ) : null}
          <button
            type="button"
            className="kb-btn ghost"
            onClick={() => {
              const msg = isRunning
                ? 'Archive this ticket? Its running agent will be stopped.'
                : 'Archive this ticket?';
              if (!window.confirm(msg)) return;
              void api.archiveIssue(issueNumber).then(() => {
                dispatchIssuesRefetch();
                onClose();
              });
            }}
          >
            Archive
          </button>
          <button
            type="button"
            className="x-btn"
            onClick={onClose}
            aria-label="Close (Esc)"
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

        <div className="kb-modal-body">
          <main className="kb-modal-main">
            {issue ? (
              <>
                <div className={`kb-tdm-hero${isRunning ? ' running' : ''}`}>
                  <div className="kb-tdm-title-row">
                    <span className="kb-tdm-num">#{issue.number}</span>
                    <h1 className="kb-tdm-h1">{issue.title}</h1>
                  </div>
                  <div className="kb-tdm-meta-row">
                    {activeRun ? (
                      <span
                        className={`kb-status-pill kb-state-${
                          activeRun.status === 'awaiting_input'
                            ? 'awaiting'
                            : activeRun.status === 'running'
                              ? 'running'
                              : activeRun.status === 'failed'
                                ? 'failed'
                                : ''
                        }`}
                      >
                        <span className="kb-pulse" />
                        {STATUS_LABEL[activeRun.status]} · run #{activeRun.id}
                      </span>
                    ) : null}
                    {tagFromLabels(issue.labels, issue.isPullRequest) ? (
                      <span
                        className={`kb-tag kb-tag-${tagFromLabels(issue.labels, issue.isPullRequest)}`}
                      >
                        {tagFromLabels(issue.labels, issue.isPullRequest)}
                      </span>
                    ) : null}
                    {areaLabels(issue.labels).map((l) => (
                      <span key={l} className="kb-chip mono">
                        {l}
                      </span>
                    ))}
                    {priorityFromLabels(issue.labels) ? (
                      <span className="kb-chip mono">
                        priority:{priorityFromLabels(issue.labels)}
                      </span>
                    ) : null}
                    {activeRun?.branchName ? (
                      <span className="kb-chip mono">
                        <span className="k">branch</span>
                        {activeRun.branchName}
                      </span>
                    ) : null}
                    <span className="kb-chip mono">
                      <span className="k">opened</span>
                      {ageString(issue.createdAt)} ago
                    </span>
                  </div>
                </div>

                <div className="kb-tdm-tabs">
                  {(Object.keys(TAB_LABELS) as DetailTab[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`kb-tdm-tab${tab === t ? ' active' : ''}`}
                      onClick={() => setTab(t)}
                    >
                      {TAB_LABELS[t]}
                    </button>
                  ))}
                </div>

                <div className="kb-tdm-content">
                  {tab === 'overview' ? (
                    <OverviewTab issue={issue} activeRun={activeRun} />
                  ) : null}
                  {tab === 'thread' ? <ThreadTab activeRun={activeRun} /> : null}
                  {tab === 'diff' ? <DiffTabModal activeRun={activeRun} /> : null}
                  {tab === 'preview' ? <PreviewTabModal activeRun={activeRun} /> : null}
                  {tab === 'runs' ? <RunsTab issueNumber={issue.number} /> : null}
                </div>
              </>
            ) : error ? (
              <div className="kb-tdm-content" style={{ color: 'var(--failed)' }}>
                {error.message}
              </div>
            ) : (
              <div className="kb-tdm-content">Loading…</div>
            )}
          </main>

          <aside className="kb-modal-aside">
            {issue ? (
              <Aside
                issue={issue}
                activeRun={activeRun}
              />
            ) : null}
          </aside>
        </div>

        <div className="kb-modal-foot">
          <span className="hint">Reply to agent</span>
          <ReplyFooter issueNumber={issueNumber} onSent={() => mutate((p) => (p ? { ...p } : p))} />
        </div>
      </div>
    </div>
  );
}

function ReplyFooter({
  issueNumber,
  onSent,
}: {
  issueNumber: number;
  onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send(): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await api.postMessage(issueNumber, trimmed);
      setBody('');
      onSent();
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void send();
    }
  }

  return (
    <>
      <input
        type="text"
        placeholder="/spec to refine · /review to spawn reviewer · /split to fan out…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKey}
        disabled={sending}
      />
      <button
        type="button"
        className="kb-btn primary"
        onClick={() => void send()}
        disabled={!body.trim() || sending}
      >
        {sending ? 'Sending…' : 'Send'} <span className="kb-kbd">⌘↵</span>
      </button>
    </>
  );
}

function Aside({ issue, activeRun }: { issue: IssueDetailPayload['issue']; activeRun: AgentRun | null }) {
  const links = linkedIssueNumbers(issue.labels);
  return (
    <>
      <div className="kb-mas-block">
        <div className="kb-mas-h">Live run</div>
        <RunSummary run={activeRun} layout="aside" />
      </div>

      <div className="kb-mas-block">
        <div className="kb-mas-h">Properties</div>
        <div className="kb-mas-row">
          <span className="k">Status</span>
          <span className="v">{issue.status ?? 'inbox'}</span>
        </div>
        <div className="kb-mas-row">
          <span className="k">Assignee</span>
          <span className="v">{issue.assignees[0] ?? '—'}</span>
        </div>
        <div className="kb-mas-row">
          <span className="k">Priority</span>
          <span className="v">{priorityFromLabels(issue.labels) ?? '—'}</span>
        </div>
        <div className="kb-mas-row">
          <span className="k">Folder</span>
          <span className="v mono">current</span>
        </div>
        <div className="kb-mas-row">
          <span className="k">Worktree</span>
          <span className="v mono">
            {activeRun?.worktreePath ?? '—'}
          </span>
        </div>
        <div className="kb-mas-row">
          <span className="k">Branch</span>
          <span className="v mono">{activeRun?.branchName ?? '—'}</span>
        </div>
        <div className="kb-mas-row">
          <span className="k">Base</span>
          <span className="v mono">main</span>
        </div>
      </div>

      {links.length > 0 ? (
        <div className="kb-mas-block">
          <div className="kb-mas-h">Linked</div>
          <LinkedIssues numbers={links} currentNumber={issue.number} />
        </div>
      ) : null}

      <div className="kb-mas-block">
        <div className="kb-mas-h">Author</div>
        <div className="kb-mas-row">
          <span
            className="kb-rail-avatar"
            style={{
              width: 22,
              height: 22,
              fontSize: 10,
              background: colorForLogin(issue.user.login),
            }}
            aria-hidden
          >
            {issue.user.login.slice(0, 1).toUpperCase()}
          </span>
          <span className="v">{issue.user.login}</span>
        </div>
      </div>
    </>
  );
}

function LinkedIssues({
  numbers,
  currentNumber,
}: {
  numbers: number[];
  currentNumber: number;
}) {
  const { issues } = useIssues();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {numbers
        .filter((n) => n !== currentNumber)
        .map((n) => {
          const linked = issues.find((i) => i.number === n);
          return (
            <a
              key={n}
              href={`#/issue/${n}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                padding: '6px 8px',
                borderRadius: 6,
                background: 'var(--bg-2)',
                border: '1px solid var(--hairline-soft)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--ff-mono)',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                }}
              >
                #{n}
              </span>
              <span
                style={{
                  flex: 1,
                  color: 'var(--ink-1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {linked?.title ?? '(not loaded)'}
              </span>
              {linked?.state === 'closed' ? (
                <span style={{ color: 'var(--review)', fontSize: 10 }}>closed</span>
              ) : null}
            </a>
          );
        })}
    </div>
  );
}

function OverviewTab({
  issue,
  activeRun,
}: {
  issue: IssueDetailPayload['issue'];
  activeRun: AgentRun | null;
}) {
  const stream = useAgentRunStream(activeRun?.id ?? null);
  const recentToolCalls = stream.events.filter((e) => e.type === 'tool_use').slice(-4).reverse();
  const acMatches = (issue.body ?? '').match(/(?:^|\n)\s*AC:\s*\n((?:[-*]\s.+\n?)+)/);
  const acItems = acMatches?.[1]?.match(/(?:^|\n)[-*]\s(.+)/g)?.map((l) => l.replace(/^[\s-*]+/, '')) ?? [];

  return (
    <>
      <div className="kb-tdm-section">
        <h3>Description</h3>
        <div className="kb-desc-md">{issue.body || '(no description)'}</div>
      </div>

      {acItems.length > 0 ? (
        <div className="kb-tdm-section">
          <h3>Spec — extracted from AC: block</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {acItems.map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', fontSize: 12.5, color: 'var(--ink-1)' }}>
                <span
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    border: '1px solid var(--hairline)',
                    background: 'var(--bg-2)',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recentToolCalls.length > 0 ? (
        <div className="kb-tdm-section">
          <h3>What the agent did just now</h3>
          {recentToolCalls.map((ev) => {
            const p = ev.payload as { name?: string; input?: unknown };
            return (
              <div key={ev.id} className="kb-tcall">
                <div className="kb-tcall-head">
                  <span className="name">{p.name ?? 'tool'}</span>
                  <span className="arg">
                    {typeof p.input === 'string' ? p.input : JSON.stringify(p.input)}
                  </span>
                  <span className="dur">{ageString(ev.createdAt)} ago</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function ThreadTab({ activeRun }: { activeRun: AgentRun | null }) {
  const stream = useAgentRunStream(activeRun?.id ?? null);

  if (!activeRun && stream.events.length === 0) {
    return (
      <div className="kb-tdm-section">
        <h3>Agent thread</h3>
        <div className="kb-desc-md" style={{ color: 'var(--ink-3)' }}>
          No agent has been started for this issue yet.
        </div>
      </div>
    );
  }

  return (
    <div className="kb-tdm-section">
      <h3>Agent thread</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stream.events.map((ev) => {
          if (ev.type === 'text') {
            const text = (ev.payload as { text?: string }).text ?? '';
            return (
              <div
                key={ev.id}
                style={{
                  background: 'color-mix(in oklch, var(--bg-1) 80%, var(--accent-soft))',
                  border: '1px solid var(--accent-line)',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 5 }}>
                  <b style={{ color: 'var(--accent)' }}>claude</b> · {ageString(ev.createdAt)} ago
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink-1)', whiteSpace: 'pre-wrap' }}>
                  {text}
                </div>
              </div>
            );
          }
          if (ev.type === 'tool_use') {
            const p = ev.payload as { name?: string; input?: unknown };
            return (
              <div key={ev.id} className="kb-tcall">
                <div className="kb-tcall-head">
                  <span className="name">{p.name ?? 'tool'}</span>
                  <span className="arg">
                    {typeof p.input === 'string' ? p.input : JSON.stringify(p.input)}
                  </span>
                  <span className="dur" style={{ color: 'var(--running)' }}>● live</span>
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function DiffTabModal({ activeRun }: { activeRun: AgentRun | null }) {
  const [data, setData] = useState<DiffPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRun) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getAgentRunDiff(activeRun.id)
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
  }, [activeRun?.id]);

  if (!activeRun) {
    return (
      <div className="kb-tdm-section">
        <h3>Diff</h3>
        <div className="kb-desc-md" style={{ color: 'var(--ink-3)' }}>
          No active run for this issue.
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="kb-tdm-section">
        <h3>Diff</h3>
        <div className="kb-desc-md">Loading…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="kb-tdm-section">
        <h3>Diff</h3>
        <div className="kb-desc-md" style={{ color: 'var(--failed)' }}>
          {error}
        </div>
      </div>
    );
  }
  if (!data || data.empty) {
    return (
      <div className="kb-tdm-section">
        <h3>Diff</h3>
        <div className="kb-desc-md" style={{ color: 'var(--ink-3)' }}>
          No changes vs. base.
        </div>
      </div>
    );
  }
  return (
    <div className="kb-tdm-section">
      <h3>
        Diff vs {data.base} · {data.files.length} file{data.files.length === 1 ? '' : 's'}
      </h3>
      <div className="kb-diff-block">
        <div className="kb-diff-head">
          <span className="branch">{data.branch ?? 'HEAD'}</span>
          <span className="arrow">←</span>
          <span className="branch" style={{ color: 'var(--ink-3)' }}>
            {data.base}
          </span>
          <span className="stat">{data.files.length}</span>
        </div>
        {data.files.map((f) => (
          <DiffFileBlockModal key={f.path} file={f} />
        ))}
      </div>
    </div>
  );
}

function DiffFileBlockModal({ file }: { file: DiffFile }) {
  return (
    <div className="kb-diff-file">
      <div className="kb-diff-fhead">
        <span className={`stat-tag ${file.status}`}>{file.status}</span>
        <span className="path">{file.path}</span>
      </div>
      <div className="kb-diff-hunk">
        {file.patch.split('\n').map((line, idx) => {
          let cls = '';
          if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) {
            cls = '';
          } else if (line.startsWith('@@')) cls = 'hunk';
          else if (line.startsWith('+')) cls = 'add';
          else if (line.startsWith('-')) cls = 'del';
          return (
            <span key={idx} className={`kb-diff-line ${cls}`}>
              {line || ' '}
              {'\n'}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PreviewTabModal({ activeRun }: { activeRun: AgentRun | null }) {
  return (
    <div className="kb-tdm-section">
      <h3>Branch preview · live dev server on this worktree</h3>
      <PreviewPanel
        branch={activeRun?.branchName ?? null}
        worktreePath={activeRun?.worktreePath ?? null}
        {...(activeRun ? { activeRunId: activeRun.id } : {})}
        size="tall"
      />
    </div>
  );
}

function RunsTab({ issueNumber }: { issueNumber: number }) {
  const { data, loading, error } = useFetch<AgentRun[]>(`runs:${issueNumber}`, () =>
    api.listIssueRuns(issueNumber),
  );

  if (loading) {
    return (
      <div className="kb-tdm-section">
        <h3>Run history</h3>
        <div className="kb-desc-md">Loading…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="kb-tdm-section">
        <h3>Run history</h3>
        <div className="kb-desc-md" style={{ color: 'var(--failed)' }}>
          {error.message}
        </div>
      </div>
    );
  }
  const runs = data ?? [];
  if (runs.length === 0) {
    return (
      <div className="kb-tdm-section">
        <h3>Run history</h3>
        <div className="kb-desc-md" style={{ color: 'var(--ink-3)' }}>
          No agent runs yet.
        </div>
      </div>
    );
  }

  return (
    <div className="kb-tdm-section">
      <h3>Run history</h3>
      <div className="kb-run-timeline">
        {runs.map((r) => {
          const status = r.status;
          const isActive =
            status === 'running' || status === 'awaiting_input' || status === 'starting';
          return (
            <div key={r.id} className={`kb-run-row kb-status-${status}`}>
              <div className="kb-marker">
                <div className="dot" />
              </div>
              <div>
                <div className="kb-run-meta-line">
                  <span style={{ color: isActive ? 'var(--running)' : 'var(--ink-2)', fontWeight: 600 }}>
                    {status === 'running' ? '● Running' : status === 'complete' ? '✓ Completed' : status === 'failed' ? '✗ Failed' : status === 'awaiting_input' ? '? Awaiting' : status === 'stopped' ? '◼ Stopped' : '… Starting'}
                  </span>
                  <span className="id">run #{r.id}</span>
                  <span>· {ageString(r.startedAt)} ago</span>
                </div>
                <div className="kb-run-summary">{r.exitReason ?? '(no exit reason)'}</div>
                <div className="kb-run-stats-inline">
                  <span>{r.model ?? '—'}</span>
                  <span>
                    {fmtTokens(r.tokenUsageInput)}/{fmtTokens(r.tokenUsageOutput)} tok
                  </span>
                  <span>{fmtElapsed(r.startedAt, r.endedAt ?? undefined)}</span>
                </div>
              </div>
              <button type="button" className="kb-btn ghost" disabled title="Phase 11">
                {isActive ? 'Stop' : 'View'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

