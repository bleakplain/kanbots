import type { Db } from '../db.js';
import type { Card, CardId, CardStatus, CardType, MessageId } from '../types.js';

export class CardAlreadyResolvedError extends Error {
  constructor(
    public readonly cardId: CardId,
    public readonly status: CardStatus,
  ) {
    super(`Card ${cardId} cannot be resolved (status: ${status})`);
    this.name = 'CardAlreadyResolvedError';
  }
}

interface CardRow {
  id: number;
  message_id: number;
  type: string;
  payload: string;
  status: string;
  resolved_value: string | null;
  resolved_at: string | null;
}

function rowToCard(row: CardRow): Card {
  return {
    id: row.id,
    messageId: row.message_id,
    type: row.type as CardType,
    payload: JSON.parse(row.payload) as unknown,
    status: row.status as CardStatus,
    resolvedValue: row.resolved_value === null ? null : (JSON.parse(row.resolved_value) as unknown),
    resolvedAt: row.resolved_at,
  };
}

export interface CreateCardInput {
  messageId: MessageId;
  type: CardType;
  payload: unknown;
}

export class CardsRepo {
  constructor(private readonly db: Db) {}

  create(input: CreateCardInput): Card {
    const result = this.db
      .prepare('INSERT INTO cards (message_id, type, payload, status) VALUES (?, ?, ?, ?)')
      .run(input.messageId, input.type, JSON.stringify(input.payload), 'pending');
    return {
      id: Number(result.lastInsertRowid),
      messageId: input.messageId,
      type: input.type,
      payload: input.payload,
      status: 'pending',
      resolvedValue: null,
      resolvedAt: null,
    };
  }

  resolve(id: CardId, value: unknown): Card {
    const resolvedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE cards SET status = 'resolved', resolved_value = ?, resolved_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(JSON.stringify(value), resolvedAt, id);

    if (result.changes === 0) {
      const existing = this.findById(id);
      if (!existing) throw new Error(`Card ${id} not found`);
      throw new CardAlreadyResolvedError(id, existing.status);
    }

    const card = this.findById(id);
    if (!card) throw new Error(`Card ${id} not found`);
    return card;
  }

  dismiss(id: CardId): Card {
    this.db.prepare("UPDATE cards SET status = 'dismissed' WHERE id = ?").run(id);
    const card = this.findById(id);
    if (!card) throw new Error(`Card ${id} not found`);
    return card;
  }

  findById(id: CardId): Card | null {
    const row = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow | undefined;
    return row ? rowToCard(row) : null;
  }

  listByMessage(messageId: MessageId): Card[] {
    const rows = this.db
      .prepare('SELECT * FROM cards WHERE message_id = ? ORDER BY id')
      .all(messageId) as CardRow[];
    return rows.map(rowToCard);
  }
}
