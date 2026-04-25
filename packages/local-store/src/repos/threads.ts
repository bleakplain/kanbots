import type { Db } from '../db.js';
import type { Thread, ThreadId } from '../types.js';

interface ThreadRow {
  id: number;
  repo_owner: string;
  repo_name: string;
  issue_number: number;
  created_at: string;
}

function rowToThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    issueNumber: row.issue_number,
    createdAt: row.created_at,
  };
}

export interface CreateThreadInput {
  repoOwner: string;
  repoName: string;
  issueNumber: number;
}

export class ThreadsRepo {
  constructor(private readonly db: Db) {}

  create(input: CreateThreadInput): Thread {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(
        'INSERT INTO threads (repo_owner, repo_name, issue_number, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(input.repoOwner, input.repoName, input.issueNumber, createdAt);
    return {
      id: Number(result.lastInsertRowid),
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      issueNumber: input.issueNumber,
      createdAt,
    };
  }

  getOrCreate(input: CreateThreadInput): Thread {
    const existing = this.findByIssue(input.repoOwner, input.repoName, input.issueNumber);
    return existing ?? this.create(input);
  }

  findByIssue(repoOwner: string, repoName: string, issueNumber: number): Thread | null {
    const row = this.db
      .prepare('SELECT * FROM threads WHERE repo_owner = ? AND repo_name = ? AND issue_number = ?')
      .get(repoOwner, repoName, issueNumber) as ThreadRow | undefined;
    return row ? rowToThread(row) : null;
  }

  findById(id: ThreadId): Thread | null {
    const row = this.db.prepare('SELECT * FROM threads WHERE id = ?').get(id) as
      | ThreadRow
      | undefined;
    return row ? rowToThread(row) : null;
  }

  list(): Thread[] {
    const rows = this.db.prepare('SELECT * FROM threads ORDER BY id').all() as ThreadRow[];
    return rows.map(rowToThread);
  }
}
