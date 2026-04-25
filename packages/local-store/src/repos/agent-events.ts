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
      .prepare(
        'SELECT * FROM agent_events WHERE agent_run_id = ? AND seq > ? ORDER BY seq',
      )
      .all(agentRunId, afterSeq) as AgentEventRow[];
    return rows.map(rowToAgentEvent);
  }
}
