import type { CardStatus, CardSummary } from '@kanbots/cloud-client';

export interface CloudColumnProps {
  status: CardStatus;
  label: string;
  cards: CardSummary[];
  onOpenCard: (number: number) => void;
}

const STATUS_COLORS: Record<CardStatus, string> = {
  inbox: 'var(--ink-3)',
  backlog: 'var(--ink-3)',
  ready: 'oklch(0.7 0.18 240)',
  in_progress: 'oklch(0.78 0.16 90)',
  review: 'oklch(0.7 0.18 320)',
  done: 'oklch(0.65 0.16 150)',
  blocked: 'oklch(0.65 0.18 25)',
  archived: 'var(--ink-3)',
};

export function CloudColumn({ status, label, cards, onOpenCard }: CloudColumnProps) {
  return (
    <section
      style={{
        flex: '0 0 280px',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-1, transparent)',
        border: '1px solid var(--hairline-soft)',
        borderRadius: 8,
        maxHeight: 'calc(100vh - 100px)',
      }}
    >
      <header
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--hairline-soft)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: STATUS_COLORS[status],
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <span>{label}</span>
        <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{cards.length}</span>
      </header>
      <ul
        style={{
          listStyle: 'none',
          padding: 8,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflow: 'auto',
        }}
      >
        {cards.length === 0 ? (
          <li style={{ color: 'var(--ink-3)', fontSize: 12, padding: 8 }}>—</li>
        ) : (
          cards.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => onOpenCard(card.number)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: '1px solid var(--hairline-soft)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>#{card.number}</span>
                <strong style={{ fontSize: 13, fontWeight: 500 }}>{card.title}</strong>
                <span style={{ fontSize: 11, color: 'var(--ink-3)', display: 'flex', gap: 8 }}>
                  {card.comment_count > 0 ? <span>💬 {card.comment_count}</span> : null}
                  {card.run_count > 0 ? <span>▶ {card.run_count}</span> : null}
                  {card.attachment_count > 0 ? <span>📎 {card.attachment_count}</span> : null}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
