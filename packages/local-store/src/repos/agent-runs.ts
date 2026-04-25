import type { Db } from '../db.js';
import type { AgentRun, AgentRunId, AgentRunStatus, ThreadId } from '../types.js';

interface AgentRunRow {
  id: number;
  thread_id: number;
  worktree_path: string | null;
  branch_name: string | null;
  pid: number | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  token_usage_input: number | null;
  token_usage_output: number | null;
  exit_reason: string | null;
}

function rowToAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    threadId: row.thread_id,
    worktreePath: row.worktree_path,
    branchName: row.branch_name,
    pid: row.pid,
    status: row.status as AgentRunStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    tokenUsageInput: row.token_usage_input,
    tokenUsageOutput: row.token_usage_output,
    exitReason: row.exit_reason,
  };
}

export interface CreateAgentRunInput {
  threadId: ThreadId;
  status?: AgentRunStatus;
  worktreePath?: string;
  branchName?: string;
}

export interface UpdateAgentRunPatch {
  status?: AgentRunStatus;
  worktreePath?: string | null;
  branchName?: string | null;
  pid?: number | null;
  endedAt?: string | null;
  tokenUsageInput?: number | null;
  tokenUsageOutput?: number | null;
  exitReason?: string | null;
}

const PATCH_COLUMNS: Record<keyof UpdateAgentRunPatch, string> = {
  status: 'status',
  worktreePath: 'worktree_path',
  branchName: 'branch_name',
  pid: 'pid',
  endedAt: 'ended_at',
  tokenUsageInput: 'token_usage_input',
  tokenUsageOutput: 'token_usage_output',
  exitReason: 'exit_reason',
};

const ACTIVE_STATUSES = "('starting', 'running', 'awaiting_input')";

export class AgentRunsRepo {
  constructor(private readonly db: Db) {}

  create(input: CreateAgentRunInput): AgentRun {
    const startedAt = new Date().toISOString();
    const status = input.status ?? 'starting';
    const worktreePath = input.worktreePath ?? null;
    const branchName = input.branchName ?? null;

    const result = this.db
      .prepare(
        `INSERT INTO agent_runs (thread_id, status, started_at, worktree_path, branch_name)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.threadId, status, startedAt, worktreePath, branchName);

    return {
      id: Number(result.lastInsertRowid),
      threadId: input.threadId,
      worktreePath,
      branchName,
      pid: null,
      status,
      startedAt,
      endedAt: null,
      tokenUsageInput: null,
      tokenUsageOutput: null,
      exitReason: null,
    };
  }

  update(id: AgentRunId, patch: UpdateAgentRunPatch): AgentRun {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const key of Object.keys(PATCH_COLUMNS) as (keyof UpdateAgentRunPatch)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      fields.push(`${PATCH_COLUMNS[key]} = ?`);
      values.push(value);
    }

    if (fields.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE agent_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const run = this.findById(id);
    if (!run) throw new Error(`AgentRun ${id} not found`);
    return run;
  }

  findById(id: AgentRunId): AgentRun | null {
    const row = this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as
      | AgentRunRow
      | undefined;
    return row ? rowToAgentRun(row) : null;
  }

  findActiveForThread(threadId: ThreadId): AgentRun | null {
    const row = this.db
      .prepare(
        `SELECT * FROM agent_runs WHERE thread_id = ? AND status IN ${ACTIVE_STATUSES}
         ORDER BY id DESC LIMIT 1`,
      )
      .get(threadId) as AgentRunRow | undefined;
    return row ? rowToAgentRun(row) : null;
  }

  listByThread(threadId: ThreadId): AgentRun[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_runs WHERE thread_id = ? ORDER BY id')
      .all(threadId) as AgentRunRow[];
    return rows.map(rowToAgentRun);
  }

  listOrphans(): AgentRun[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_runs WHERE status IN ${ACTIVE_STATUSES} AND pid IS NOT NULL`,
      )
      .all() as AgentRunRow[];
    return rows.map(rowToAgentRun);
  }
}
