import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { api } from '../api.js';
import { ModelPicker } from '../components/forms/ModelPicker.js';
import { useAgentRunStream } from '../hooks/useAgentRunStream.js';
import { ageString } from '../labels.js';
import { ToolUseCard } from '../components/run/ToolUseCard.js';
import { AgentSpinner } from '../components/run/AgentSpinner.js';
import type {
  AgentEvent,
  AgentRun,
  AgentRunStatus,
  Card,
  ChatConversation,
  DecisionPayload,
  Message,
} from '../types.js';

const STATUS_LABEL: Record<AgentRunStatus, string> = {
  starting: 'STARTING',
  running: 'RUNNING',
  awaiting_input: 'AWAITING INPUT',
  complete: 'COMPLETE',
  failed: 'FAILED',
  stopped: 'STOPPED',
};

function parseInitialConversationId(): number | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  const match = hash.match(/^\/chat\/(\d+)/);
  if (!match || !match[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function setLocationHash(conversationId: number | null): void {
  if (typeof window === 'undefined') return;
  const target = conversationId === null ? '#/chat' : `#/chat/${conversationId}`;
  if (window.location.hash === target) return;
  window.history.replaceState(null, '', target);
}

export function ChatApp() {
  const [conversationId, setConversationId] = useState<number | null>(parseInitialConversationId);
  const [bootstrapping, setBootstrapping] = useState(conversationId === null);
  const [error, setError] = useState<string | null>(null);

  // When the window opens without a specific conversation in the hash, spin
  // up a fresh conversation immediately so the user lands directly on a
  // usable chat. Multi-conversation management is intentionally not in this
  // window — users open more chat windows for parallel chats.
  useEffect(() => {
    if (conversationId !== null) return;
    let cancelled = false;
    setBootstrapping(true);
    api
      .createChat()
      .then((payload) => {
        if (cancelled) return;
        setConversationId(payload.conversation.id);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    setLocationHash(conversationId);
  }, [conversationId]);

  return (
    <div className="kb-stage" data-host="desktop">
      <div className="kb-window kb-app kb-chat-window">
        <ChatTitleBar />
        <div className="kb-chat-shell">
          {conversationId !== null ? (
            <ChatRoom conversationId={conversationId} />
          ) : (
            <ChatBootstrap loading={bootstrapping} error={error} />
          )}
        </div>
      </div>
    </div>
  );
}

function ChatTitleBar() {
  const bridge = typeof window !== 'undefined' ? window.kanbots : undefined;
  return (
    <div className="kb-titlebar">
      <div className="kb-tlights">
        <button
          type="button"
          className="kb-tlight r"
          aria-label="Close"
          title="Close"
          disabled={!bridge}
          onClick={() => bridge?.closeWindow()}
        />
        <button
          type="button"
          className="kb-tlight y"
          aria-label="Minimize"
          title="Minimize"
          disabled={!bridge}
          onClick={() => bridge?.minimizeWindow()}
        />
        <button
          type="button"
          className="kb-tlight g"
          aria-label="Maximize"
          title="Maximize"
          disabled={!bridge}
          onClick={() => bridge?.toggleMaximizeWindow()}
        />
      </div>
      <div className="kb-tbar-title">
        <span className="kb-tdot" />
        <span>kanbots chat</span>
        <span className="kb-sep">/</span>
        <span className="kb-folder">general-purpose agent</span>
      </div>
      <div className="kb-tbar-actions" />
    </div>
  );
}

function ChatBootstrap({
  loading,
  error,
}: {
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="kb-chat-bootstrap">
      {error ? (
        <>
          <div className="kb-chat-bootstrap-title">Couldn't start chat</div>
          <div className="kb-chat-bootstrap-error">{error}</div>
        </>
      ) : (
        <div className="kb-chat-bootstrap-title">
          {loading ? 'Starting a new conversation…' : 'Waiting…'}
        </div>
      )}
    </div>
  );
}

function ChatRoom({ conversationId }: { conversationId: number }) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyEvents, setHistoryEvents] = useState<AgentEvent[]>([]);
  const [historyCards, setHistoryCards] = useState<Card[]>([]);
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [latestRun, setLatestRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped after each send so useAgentRunStream re-subscribes — the server
  // closes the subscription on terminal status, and a chat resume reuses
  // the same run id, so without this bump we'd miss the resumed run's
  // events.
  const [streamGen, setStreamGen] = useState(0);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const payload = await api.getChat(conversationId);
      setConversation(payload.conversation);
      setMessages(payload.messages);
      setHistoryEvents(payload.events);
      setHistoryCards(payload.cards);
      setActiveRun(payload.activeRun);
      setLatestRun(payload.latestRun);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const displayRun = activeRun ?? latestRun;
  const stream = useAgentRunStream(displayRun?.id ?? null, streamGen);

  // When the active run finishes (status flips to a terminal state) the
  // server-side row updates but our cached `activeRun` doesn't. Refetch
  // the conversation snapshot whenever the stream's status changes.
  const lastSeenStatusRef = useRef<AgentRunStatus | null>(null);
  useEffect(() => {
    if (!stream.status) return;
    if (lastSeenStatusRef.current === stream.status) return;
    lastSeenStatusRef.current = stream.status;
    if (
      stream.status === 'complete' ||
      stream.status === 'failed' ||
      stream.status === 'stopped' ||
      stream.status === 'awaiting_input'
    ) {
      void refresh();
    }
  }, [stream.status, refresh]);

  const isLive =
    activeRun !== null &&
    displayRun !== null &&
    displayRun.id === activeRun.id &&
    (stream.status === 'running' ||
      stream.status === 'starting' ||
      stream.status === 'awaiting_input');

  // Merge persisted history with the live stream, deduped by id. The live
  // stream is authoritative if both sides have an entry (it carries the
  // freshest payload for an in-flight tool call).
  const mergedEvents = useMemo(() => {
    const byId = new Map<number, AgentEvent>();
    for (const e of historyEvents) byId.set(e.id, e);
    for (const e of stream.events) byId.set(e.id, e);
    return Array.from(byId.values());
  }, [historyEvents, stream.events]);

  const mergedCards = useMemo(() => {
    const byId = new Map<number, Card>();
    for (const c of historyCards) byId.set(c.id, c);
    for (const c of stream.cards) byId.set(c.id, c);
    return Array.from(byId.values());
  }, [historyCards, stream.cards]);

  const cardsByMessageId = useMemo(() => {
    const map = new Map<number, Card[]>();
    for (const c of mergedCards) {
      const arr = map.get(c.messageId) ?? [];
      arr.push(c);
      map.set(c.messageId, arr);
    }
    return map;
  }, [mergedCards]);

  const resultByToolUseId = useMemo(() => {
    const idx = new Map<string, AgentEvent>();
    for (const e of mergedEvents) {
      if (e.type !== 'tool_result') continue;
      const id = (e.payload as { toolUseId?: unknown }).toolUseId;
      if (typeof id === 'string') idx.set(id, e);
    }
    return idx;
  }, [mergedEvents]);

  type Item =
    | { kind: 'message'; sortKey: string; id: string; message: Message; cards: Card[] }
    | { kind: 'event'; sortKey: string; id: string; event: AgentEvent };

  const items: Item[] = useMemo(() => {
    const all: Item[] = [];
    for (const m of messages) {
      all.push({
        kind: 'message',
        sortKey: m.createdAt,
        id: `m${m.id}`,
        message: m,
        cards: cardsByMessageId.get(m.id) ?? [],
      });
    }
    for (const e of mergedEvents) {
      if (e.type === 'tool_result') continue;
      all.push({ kind: 'event', sortKey: e.createdAt, id: `e${e.id}`, event: e });
    }
    all.sort((a, b) => {
      if (a.sortKey === b.sortKey) return a.id.localeCompare(b.id);
      return a.sortKey < b.sortKey ? -1 : 1;
    });
    return all;
  }, [messages, mergedEvents, cardsByMessageId]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef(true);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = (): void => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickyRef.current = distance <= 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!stickyRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [items.length, isLive]);

  const status = stream.status ?? displayRun?.status ?? null;
  const statusClass = status ? `kb-chat-status s-${status}` : 'kb-chat-status';

  return (
    <div className="kb-chat-room">
      <header className="kb-chat-header">
        <div className="kb-chat-header-main">
          <ChatTitleEditor
            conversation={conversation}
            onRenamed={(updated) => setConversation(updated)}
          />
          {displayRun ? (
            <span className={statusClass}>
              <span className="kb-chat-status-dot" />
              run #{displayRun.id} · {STATUS_LABEL[stream.status ?? displayRun.status]}
            </span>
          ) : (
            <span className="kb-chat-status">
              <span className="kb-chat-status-dot idle" />
              ready
            </span>
          )}
        </div>
        {activeRun &&
        (stream.status === 'running' ||
          stream.status === 'starting' ||
          stream.status === 'awaiting_input') ? (
          <button
            type="button"
            className="kb-btn ghost"
            onClick={() => {
              void api.stopChatRun(activeRun.id).then(() => refresh());
            }}
          >
            Stop
          </button>
        ) : null}
      </header>

      <div ref={scrollerRef} className="kb-chat-scroller">
        {items.length === 0 && !isLive ? (
          <div className="kb-chat-empty">
            <div className="kb-chat-empty-emoji">💬</div>
            <div className="kb-chat-empty-title">Start the conversation</div>
            <div className="kb-chat-empty-sub">
              Ask the kanbots agent anything about your board or codebase.
            </div>
          </div>
        ) : null}
        {items.map((it) =>
          it.kind === 'message' ? (
            <MessageRow key={it.id} message={it.message} cards={it.cards} onResolved={() => void refresh()} />
          ) : it.event.type === 'tool_use' ? (
            <ToolUseCard
              key={it.id}
              toolUse={it.event}
              result={resultByToolUseId.get(toolUseIdOf(it.event)) ?? null}
              isLive={isLive}
            />
          ) : (
            <EventRow key={it.id} event={it.event} />
          ),
        )}
        {isLive && displayRun ? (
          <AgentSpinner
            seed={displayRun.id}
            startedAt={displayRun.startedAt}
            tokensOut={displayRun.tokenUsageOutput ?? null}
          />
        ) : null}
      </div>

      <ReplyFooter
        conversationId={conversationId}
        disabled={
          activeRun !== null &&
          (stream.status === 'running' || stream.status === 'starting')
        }
        onSent={() => {
          setStreamGen((g) => g + 1);
          void refresh();
        }}
      />
      {error ? <div className="kb-chat-error">{error}</div> : null}
    </div>
  );
}

function ChatTitleEditor({
  conversation,
  onRenamed,
}: {
  conversation: ChatConversation | null;
  onRenamed: (next: ChatConversation) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function startEdit(): void {
    if (!conversation) return;
    setDraft(conversation.title);
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  async function commit(): Promise<void> {
    if (!conversation) return;
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === conversation.title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.renameChat(conversation.id, trimmed);
      onRenamed(updated);
    } catch {
      // best-effort: silently ignore; the existing title stays.
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (!conversation) {
    return <h2 className="kb-chat-title">…</h2>;
  }
  if (editing) {
    return (
      <input
        ref={inputRef}
        className="kb-chat-title-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
        disabled={saving}
        maxLength={200}
      />
    );
  }
  return (
    <button
      type="button"
      className="kb-chat-title kb-chat-title-btn"
      title="Click to rename"
      onClick={startEdit}
    >
      {conversation.title}
      <span className="kb-chat-title-pencil" aria-hidden>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </span>
    </button>
  );
}

function ReplyFooter({
  conversationId,
  disabled,
  onSent,
}: {
  conversationId: number;
  disabled: boolean;
  onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const [modelSelection, setModelSelection] =
    useState<import('../components/forms/ModelPicker.js').ModelPickerValue | null>(null);
  const [appendSystemPrompt, setAppendSystemPrompt] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    setError(null);
    try {
      const opts: Parameters<typeof api.postChatMessage>[2] = {};
      if (modelSelection) {
        opts.model = modelSelection.model;
        opts.provider = modelSelection.provider;
      }
      if (appendSystemPrompt.trim().length > 0) {
        opts.appendSystemPrompt = appendSystemPrompt.trim();
      }
      const result = await api.postChatMessage(conversationId, trimmed, opts);
      setBody('');
      if (result.dispatchError) {
        setError(result.dispatchError);
      }
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
    <div className="kb-chat-foot">
      {showAdvanced ? (
        <div className="kb-chat-foot-advanced">
          <label className="kb-chat-foot-field">
            <span className="kb-chat-foot-field-label">Model</span>
            <ModelPicker
              value={modelSelection}
              onChange={setModelSelection}
              agentRunsOnly
              className="kb-chat-model-picker"
            />
          </label>
          <label className="kb-chat-foot-field kb-chat-foot-field-grow">
            <span className="kb-chat-foot-field-label">Append system prompt</span>
            <textarea
              placeholder="optional — appended after the chat-mode prompt"
              value={appendSystemPrompt}
              onChange={(e) => setAppendSystemPrompt(e.target.value)}
              rows={2}
              className="kb-chat-foot-syspr"
            />
          </label>
        </div>
      ) : null}
      <div className="kb-chat-foot-row">
        <textarea
          className="kb-chat-foot-input"
          placeholder={
            disabled ? 'agent is running…' : 'Ask the agent…'
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKey}
          disabled={sending}
          rows={3}
        />
        <button
          type="button"
          className="kb-btn primary kb-chat-send-btn"
          onClick={() => void send()}
          disabled={!body.trim() || sending || disabled}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
      <div className="kb-chat-foot-bottom">
        <button
          type="button"
          className="kb-chat-foot-opts-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          <span className={`kb-chat-foot-opts-chev${showAdvanced ? ' open' : ''}`}>›</span>
          {showAdvanced ? 'Hide options' : 'Options'}
        </button>
        <span className="kb-chat-foot-hint">⌘↵ to send</span>
      </div>
      {error ? <div className="kb-chat-foot-error">{error}</div> : null}
    </div>
  );
}

function MessageRow({
  message,
  cards,
  onResolved,
}: {
  message: Message;
  cards: Card[];
  onResolved: () => void;
}) {
  if (message.role === 'system') {
    return (
      <div className="kb-chat-sysmsg">
        — {message.body} · {ageString(message.createdAt)} ago —
        {cards.map((c) =>
          c.type === 'decision' ? (
            <DecisionInline
              key={c.id}
              card={c as Card<DecisionPayload>}
              onResolved={onResolved}
            />
          ) : null,
        )}
      </div>
    );
  }
  const isUser = message.role === 'user';
  const label = isUser ? 'you' : 'claude';
  return (
    <div className={`kb-chat-msg ${isUser ? 'kb-chat-msg-user' : 'kb-chat-msg-agent'}`}>
      <div className="kb-chat-msg-meta">
        <b className="kb-chat-msg-author">{label}</b>
        <span className="kb-chat-msg-time"> · {ageString(message.createdAt)} ago</span>
      </div>
      <div className="kb-chat-msg-body">{message.body}</div>
      {cards.map((c) =>
        c.type === 'decision' ? (
          <DecisionInline
            key={c.id}
            card={c as Card<DecisionPayload>}
            onResolved={onResolved}
          />
        ) : null,
      )}
    </div>
  );
}

function DecisionInline({
  card,
  onResolved,
}: {
  card: Card<DecisionPayload>;
  onResolved: () => void;
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPending = card.status === 'pending';
  const isResolved = card.status === 'resolved';
  const isDismissed = card.status === 'dismissed';

  async function pick(value: string): Promise<void> {
    if (!isPending || submitting !== null) return;
    setSubmitting(value);
    setError(null);
    try {
      await api.resolveCard(card.id, value);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(null);
    }
  }

  async function dismiss(): Promise<void> {
    if (!isPending || submitting !== null) return;
    setSubmitting('__dismiss');
    setError(null);
    try {
      await api.dismissCard(card.id);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(null);
    }
  }

  return (
    <div className="kb-decision" role="region" aria-label="Agent question" style={{ marginTop: 10 }}>
      <div className="kb-decision-opts">
        {card.payload.options.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            className={`kb-decision-opt${submitting === opt.value ? ' chosen' : ''}`}
            disabled={!isPending || submitting !== null}
            onClick={() => void pick(opt.value)}
          >
            <span className="num">{i + 1}</span>
            {opt.label}
          </button>
        ))}
        {isPending ? (
          <button
            key="__dismiss"
            type="button"
            className="kb-decision-opt dismiss"
            disabled={submitting !== null}
            onClick={() => void dismiss()}
            title="Dismiss this decision and stop the run"
          >
            Dismiss
          </button>
        ) : null}
      </div>
      {isResolved ? <div className="kb-decision-resolved-note">resolved</div> : null}
      {isDismissed ? <div className="kb-decision-resolved-note">dismissed</div> : null}
      {error ? <div className="kb-decision-resolved-note">error: {error}</div> : null}
    </div>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  if (event.type === 'text') {
    const text = (event.payload as { text?: string }).text ?? '';
    return (
      <div className="kb-chat-msg kb-chat-msg-agent">
        <div className="kb-chat-msg-meta">
          <b className="kb-chat-msg-author">claude</b>
          <span className="kb-chat-msg-time"> · {ageString(event.createdAt)} ago</span>
        </div>
        <div className="kb-chat-msg-body">{text}</div>
      </div>
    );
  }
  if (event.type === 'error') {
    const p = event.payload as { message?: string };
    return (
      <div className="kb-tcall" style={{ borderColor: 'var(--failed)' }}>
        <div className="kb-tcall-head">
          <span className="name" style={{ color: 'var(--failed)' }}>error</span>
          <span className="arg">{p.message ?? 'unknown'}</span>
          <span className="dur">{ageString(event.createdAt)} ago</span>
        </div>
      </div>
    );
  }
  return null;
}

function toolUseIdOf(ev: AgentEvent): string {
  const id = (ev.payload as { toolUseId?: unknown }).toolUseId;
  return typeof id === 'string' ? id : `seq:${ev.seq}`;
}
