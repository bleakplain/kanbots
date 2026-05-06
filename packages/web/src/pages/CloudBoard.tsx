import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBridge } from '../desktop-bridge.js';
import type {
  ActiveCloudWorkspaceInfo,
  RecentCloudWorkspace,
} from '../desktop-bridge.js';
import type { CardStatus, CardSummary } from '@kanbots/cloud-client';
import { CloudCardModal } from '../components/cloud/CloudCardModal.js';
import { CloudColumn } from '../components/cloud/CloudColumn.js';

export interface CloudBoardProps {
  workspace: ActiveCloudWorkspaceInfo;
  onSwitchWorkspace: () => void;
}

const COLUMNS: { key: CardStatus; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'ready', label: 'Ready' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
  { key: 'blocked', label: 'Blocked' },
];

interface CardsState {
  loading: boolean;
  error: string | null;
  cards: CardSummary[];
}

/**
 * Cloud-mode kanban board. Pulls cards from the v1 API for the
 * active org+project; supports view/edit/comment/dispatch. Drag-drop
 * positioning is deferred — status changes flow through the card
 * modal for now.
 */
export function CloudBoard({ workspace, onSwitchWorkspace }: CloudBoardProps) {
  const [state, setState] = useState<CardsState>({
    loading: true,
    error: null,
    cards: [],
  });
  const [openCardNumber, setOpenCardNumber] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    const bridge = getBridge();
    if (!bridge) {
      setState((s) => ({ ...s, loading: false, error: 'Desktop bridge unavailable.' }));
      return;
    }
    try {
      const list = await bridge.cloudCardsList({
        orgSlug: workspace.orgSlug,
        projectSlug: workspace.projectSlug,
        query: { limit: 100 },
      });
      setState({ loading: false, error: null, cards: list.data });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        cards: [],
      });
    }
  }, [workspace.orgSlug, workspace.projectSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    const out: Record<CardStatus, CardSummary[]> = {
      inbox: [],
      backlog: [],
      ready: [],
      in_progress: [],
      review: [],
      done: [],
      blocked: [],
      archived: [],
    };
    for (const card of state.cards) {
      // 'archived' cards are filtered out of the board view; users see them
      // in a future archive panel.
      if (card.archived_at !== null) continue;
      out[card.status].push(card);
    }
    for (const k of Object.keys(out) as CardStatus[]) {
      out[k].sort((a, b) => a.position.localeCompare(b.position));
    }
    return out;
  }, [state.cards]);

  async function handleCreate(): Promise<void> {
    const bridge = getBridge();
    if (!bridge || newTitle.trim().length === 0) return;
    setCreating(false);
    const title = newTitle.trim();
    setNewTitle('');
    try {
      await bridge.cloudCardsCreate({
        orgSlug: workspace.orgSlug,
        projectSlug: workspace.projectSlug,
        body: { title },
      });
      await refresh();
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid var(--hairline-soft)',
        }}
      >
        <strong>{workspace.projectDisplayName}</strong>
        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          {workspace.orgDisplayName} · cloud
        </span>
        <span style={{ flex: 1 }} />
        {creating ? (
          <>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New card title"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewTitle('');
                }
              }}
              style={{
                padding: '6px 10px',
                border: '1px solid var(--hairline-soft)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--ink)',
                minWidth: 240,
              }}
            />
            <button
              type="button"
              className="kb-btn primary"
              onClick={() => void handleCreate()}
              disabled={newTitle.trim().length === 0}
            >
              Create
            </button>
            <button
              type="button"
              className="kb-btn ghost"
              onClick={() => {
                setCreating(false);
                setNewTitle('');
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="kb-btn primary"
            onClick={() => setCreating(true)}
          >
            + New card
          </button>
        )}
        <button type="button" className="kb-btn ghost" onClick={() => void refresh()}>
          Refresh
        </button>
        <button type="button" className="kb-btn ghost" onClick={onSwitchWorkspace}>
          Switch workspace
        </button>
      </header>

      {state.error !== null ? (
        <div
          role="alert"
          style={{
            background: 'oklch(0.7 0.18 25 / 0.08)',
            color: 'var(--failed)',
            padding: '8px 16px',
            fontSize: 12,
            borderBottom: '1px solid var(--hairline-soft)',
          }}
        >
          {state.error}
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        {state.loading ? (
          <div style={{ color: 'var(--ink-3)' }}>Loading cards…</div>
        ) : (
          COLUMNS.map((col) => (
            <CloudColumn
              key={col.key}
              status={col.key}
              label={col.label}
              cards={grouped[col.key]}
              onOpenCard={(n) => setOpenCardNumber(n)}
            />
          ))
        )}
      </div>

      {openCardNumber !== null ? (
        <CloudCardModal
          orgSlug={workspace.orgSlug}
          projectSlug={workspace.projectSlug}
          cardNumber={openCardNumber}
          onClose={() => setOpenCardNumber(null)}
          onChanged={() => void refresh()}
        />
      ) : null}
    </div>
  );
}

export type { RecentCloudWorkspace };
