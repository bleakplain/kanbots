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
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(parseInitialConversationId);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async (): Promise<ChatConversation[]> => {
    const list = await api.listChats();
    setConversations(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    refreshList()
      .then((list) => {
        if (cancelled) return;
        setSelectedId((prev) => {
          if (prev !== null && list.some((c) => c.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshList]);

  useEffect(() => {
    setLocationHash(selectedId);
  }, [selectedId]);

  const handleNewChat = useCallback(async (): Promise<void> => {
    try {
      const payload = await api.createChat();
      await refreshList();
      setSelectedId(payload.conversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [refreshList]);

  const handleDelete = useCallback(
    async (id: number): Promise<void> => {
      if (!window.confirm('Delete this conversation? Its history and any active run will be removed.')) {
        return;
      }
      try {
        await api.deleteChat(id);
        const list = await refreshList();
        if (selectedId === id) {
          setSelectedId(list[0]?.id ?? null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refreshList, selectedId],
  );

  const handleRename = useCallback(
    async (id: number, currentTitle: string): Promise<void> => {
      const next = window.prompt('Rename conversation', currentTitle);
      if (next === null) return;
      const trimmed = next.trim();
      if (trimmed.length === 0 || trimmed === currentTitle) return;
      try {
        await api.renameChat(id, trimmed);
        await refreshList();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refreshList],
  );

  return (
    <div className="kb-stage" data-host="desktop">
      <div className="kb-window kb-app">
        <ChatTitleBar />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '240px 1fr',
            height: 'calc(100% - 36px)',
            minHeight: 0,
          }}
        >
          <ChatSidebar
            conversations={conversations}
            selectedId={selectedId}
            loading={loadingList}
            onSelect={setSelectedId}
            onNew={() => void handleNewChat()}
            onDelete={(id) => void handleDelete(id)}
            onRename={(id, t) => void handleRename(id, t)}
          />
          {selectedId !== null ? (
            <ChatRoom
              conversationId={selectedId}
              onTouched={() => void refreshList()}
            />
          ) : (
            <ChatEmpty onNew={() => void handleNewChat()} error={error} />
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

function ChatSidebar({
  conversations,
  selectedId,
  loading,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: {
  conversations: ChatConversation[];
  selectedId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onRename: (id: number, currentTitle: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q.length === 0) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, filter]);

  return (
    <aside
      style={{
        borderRight: '1px solid var(--hairline)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--bg-1)',
      }}
    >
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className="kb-btn primary" onClick={onNew}>
          + New chat
        </button>
        <input
          type="text"
          placeholder="Search…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--hairline)',
            color: 'var(--ink-1)',
            padding: '6px 8px',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 6px 10px' }}>
        {loading ? (
          <div style={{ color: 'var(--ink-3)', fontSize: 12, padding: 8 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--ink-3)', fontSize: 12, padding: 8 }}>
            {filter ? 'No matches.' : 'No conversations yet.'}
          </div>
        ) : (
          filtered.map((c) => {
            const active = c.id === selectedId;
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                onDoubleClick={() => onRename(c.id, c.title)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: active ? 'var(--bg-2)' : 'transparent',
                  border: active
                    ? '1px solid var(--accent-line)'
                    : '1px solid transparent',
                  marginBottom: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: 'var(--ink-1)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                    {ageString(c.lastMessageAt)} ago
                  </div>
                </div>
                <button
                  type="button"
                  className="x-btn"
                  title="Delete"
                  aria-label="Delete conversation"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(c.id);
                  }}
                  style={{ visibility: active ? 'visible' : 'hidden' }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18M9 6V3h6v3M5 6l1 14h12l1-14" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function ChatEmpty({
  onNew,
  error,
}: {
  onNew: () => void;
  error: string | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 10,
        color: 'var(--ink-3)',
        padding: 30,
      }}
    >
      <div>Start a conversation with the kanbots agent.</div>
      <button type="button" className="kb-btn primary" onClick={onNew}>
        + New chat
      </button>
      {error ? (
        <div style={{ color: 'var(--failed)', fontSize: 12 }}>{error}</div>
      ) : null}
    </div>
  );
}

function ChatRoom({
  conversationId,
  onTouched,
}: {
  conversationId: number;
  onTouched: () => void;
}) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [latestRun, setLatestRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const payload = await api.getChat(conversationId);
      setConversation(payload.conversation);
      setMessages(payload.messages);
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
  const stream = useAgentRunStream(displayRun?.id ?? null);

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

  const cardsByMessageId = useMemo(() => {
    const map = new Map<number, Card[]>();
    for (const c of stream.cards) {
      const arr = map.get(c.messageId) ?? [];
      arr.push(c);
      map.set(c.messageId, arr);
    }
    return map;
  }, [stream.cards]);

  const resultByToolUseId = useMemo(() => {
    const idx = new Map<string, AgentEvent>();
    for (const e of stream.events) {
      if (e.type !== 'tool_result') continue;
      const id = (e.payload as { toolUseId?: unknown }).toolUseId;
      if (typeof id === 'string') idx.set(id, e);
    }
    return idx;
  }, [stream.events]);

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
    for (const e of stream.events) {
      if (e.type === 'tool_result') continue;
      all.push({ kind: 'event', sortKey: e.createdAt, id: `e${e.id}`, event: e });
    }
    all.sort((a, b) => {
      if (a.sortKey === b.sortKey) return a.id.localeCompare(b.id);
      return a.sortKey < b.sortKey ? -1 : 1;
    });
    return all;
  }, [messages, stream.events, cardsByMessageId]);

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
  }, [items.length, stream.events.length, isLive]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 14, color: 'var(--ink-1)' }}>
          {conversation?.title ?? '…'}
        </h2>
        {displayRun ? (
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            run #{displayRun.id} · {STATUS_LABEL[stream.status ?? displayRun.status]}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
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
      </div>

      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minHeight: 0,
        }}
      >
        {items.length === 0 && !isLive ? (
          <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            No messages yet. Send your first prompt below.
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
          onTouched();
          void refresh();
        }}
      />
      {error ? (
        <div
          style={{
            padding: '6px 14px',
            color: 'var(--failed)',
            background: 'var(--bg-2)',
            borderTop: '1px solid var(--hairline)',
            fontSize: 11,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
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
    <div
      style={{
        borderTop: '1px solid var(--hairline)',
        padding: 12,
        background: 'var(--bg-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {showAdvanced ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ModelPicker
            value={modelSelection}
            onChange={setModelSelection}
            agentRunsOnly
            className="kb-chat-model-picker"
          />
          <textarea
            placeholder="extra system prompt — optional"
            value={appendSystemPrompt}
            onChange={(e) => setAppendSystemPrompt(e.target.value)}
            rows={2}
            style={{
              flex: 1,
              background: 'var(--bg-2)',
              border: '1px solid var(--hairline)',
              color: 'var(--ink-1)',
              padding: '6px 8px',
              borderRadius: 6,
              fontSize: 12,
              resize: 'vertical',
            }}
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          placeholder={
            disabled ? 'agent is running…' : 'Ask the agent…  ⌘↵ to send'
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKey}
          disabled={sending}
          rows={3}
          style={{
            flex: 1,
            background: 'var(--bg-2)',
            border: '1px solid var(--hairline)',
            color: 'var(--ink-1)',
            padding: '8px 10px',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: 60,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            type="button"
            className="kb-btn ghost"
            onClick={() => setShowAdvanced((v) => !v)}
            title="Toggle model / system prompt"
            style={{ fontSize: 11 }}
          >
            {showAdvanced ? 'Hide opts' : 'Options'}
          </button>
          <button
            type="button"
            className="kb-btn primary"
            onClick={() => void send()}
            disabled={!body.trim() || sending || disabled}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
      {error ? (
        <div style={{ color: 'var(--failed)', fontSize: 11 }}>{error}</div>
      ) : null}
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
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          textAlign: 'center',
          padding: '4px 0',
        }}
      >
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
  const labelColor = isUser ? 'var(--ink-1)' : 'var(--accent)';
  const bg = isUser
    ? 'var(--bg-2)'
    : 'color-mix(in oklch, var(--bg-1) 80%, var(--accent-soft))';
  const border = isUser ? 'var(--hairline)' : 'var(--accent-line)';
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 5 }}>
        <b style={{ color: labelColor }}>{label}</b> · {ageString(message.createdAt)} ago
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--ink-1)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {message.body}
      </div>
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
      <div
        style={{
          background: 'color-mix(in oklch, var(--bg-1) 80%, var(--accent-soft))',
          border: '1px solid var(--accent-line)',
          borderRadius: 8,
          padding: '10px 12px',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 5 }}>
          <b style={{ color: 'var(--accent)' }}>claude</b> · {ageString(event.createdAt)} ago
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--ink-1)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </div>
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
