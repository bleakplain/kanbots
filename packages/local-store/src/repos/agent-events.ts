import type { Db } from '../db.js';
import type { AgentEvent, AgentEventType, AgentRunId } from '../types.js';

interface AgentEventRow {
  id: number;
  agent_run_id: number;
  seq: number;
  type: string;
  payload: string;
  created_at: string;
}

function rowToAgentEvent(row: AgentEventRow): AgentEvent {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    seq: row.seq,
    type: row.type as AgentEventType,
    payload: JSON.parse(row.payload) as unknown,
    createdAt: row.created_at,
  };
}

export interface AppendAgentEventInput {
  agentRunId: AgentRunId;
  type: AgentEventType;
  payload: unknown;
}

export interface ListAgentEventsOptions {
  afterSeq?: number;
}

export class AgentEventsRepo {
  constructor(private readonly db: Db) {}

  append(input: AppendAgentEventInput): AgentEvent {
    const tx = this.db.transaction((args: AppendAgentEventInput): AgentEvent => {
      const createdAt = new Date().toISOString();
      const payload = JSON.stringify(args.payload);

      const seqRow = this.db
        .prepare('SELECT COALESCE(MAX(seq), -1) AS max FROM agent_events WHERE agent_run_id = ?')
        .get(args.agentRunId) as { max: number };
      const seq = seqRow.max + 1;

      const result = this.db
        .prepare(
          `INSERT INTO agent_events (agent_run_id, seq, type, payload, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(args.agentRunId, seq, args.type, payload, createdAt);

      return {
        id: Number(result.lastInsertRowid),
        agentRunId: args.agentRunId,
        seq,
        type: args.type,
        payload: args.payload,
        createdAt,
      };
    });

    return tx(input);
  }

  list(agentRunId: AgentRunId, opts: ListAgentEventsOptions = {}): AgentEvent[] {
    const afterSeq = opts.afterSeq ?? -1;
    const rows = this.db
      .prepare('SELECT * FROM agent_events WHERE agent_run_id = ? AND seq > ? ORDER BY seq')
      .all(agentRunId, afterSeq) as AgentEventRow[];
    return rows.map(rowToAgentEvent);
  }

  findLatestToolUseByRun(runIds: readonly AgentRunId[]): Map<AgentRunId, AgentEvent> {
    const out = new Map<AgentRunId, AgentEvent>();
    if (runIds.length === 0) return out;
    const placeholders = runIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT e.* FROM agent_events e
         JOIN (
           SELECT agent_run_id, MAX(seq) AS max_seq
           FROM agent_events
           WHERE agent_run_id IN (${placeholders}) AND type = 'tool_use'
           GROUP BY agent_run_id
         ) latest
           ON e.agent_run_id = latest.agent_run_id AND e.seq = latest.max_seq`,
      )
      .all(...runIds) as AgentEventRow[];
    for (const row of rows) out.set(row.agent_run_id, rowToAgentEvent(row));
    return out;
  }

  countByRun(runIds: readonly AgentRunId[]): Map<AgentRunId, number> {
    const out = new Map<AgentRunId, number>();
    if (runIds.length === 0) return out;
    const placeholders = runIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT agent_run_id, COUNT(*) AS n FROM agent_events
         WHERE agent_run_id IN (${placeholders}) GROUP BY agent_run_id`,
      )
      .all(...runIds) as Array<{ agent_run_id: number; n: number }>;
    for (const row of rows) out.set(row.agent_run_id, row.n);
    return out;
  }
}
