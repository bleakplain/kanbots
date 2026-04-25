import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStore, openStoreInMemory } from '../src/index.js';

describe('migrations', () => {
  it('creates all expected tables and indexes', () => {
    const store = openStoreInMemory();
    const tables = store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = new Set(tables.map((t) => t.name));

    expect(names).toContain('_migrations');
    expect(names).toContain('threads');
    expect(names).toContain('messages');
    expect(names).toContain('cards');
    expect(names).toContain('agent_runs');
    expect(names).toContain('agent_events');
    expect(names).toContain('promotions');
    expect(names).toContain('http_cache');

    const indexes = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const idxNames = new Set(indexes.map((i) => i.name));
    expect(idxNames).toContain('idx_messages_thread');
    expect(idxNames).toContain('idx_cards_message');
    expect(idxNames).toContain('idx_events_run_seq');

    store.close();
  });

  it('records applied migrations in _migrations', () => {
    const store = openStoreInMemory();
    const rows = store.db.prepare('SELECT id FROM _migrations').all() as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual(['0001_initial']);
    store.close();
  });

  describe('idempotency', () => {
    let dir: string;
    let dbPath: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'kanbots-test-'));
      dbPath = join(dir, 'db.sqlite');
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('does not re-apply migrations on reopen', () => {
      const s1 = openStore({ path: dbPath });
      s1.close();

      const s2 = openStore({ path: dbPath });
      const rows = s2.db.prepare('SELECT COUNT(*) AS n FROM _migrations').get() as { n: number };
      expect(rows.n).toBe(1);
      s2.close();
    });

    it('preserves data across reopens', () => {
      const s1 = openStore({ path: dbPath });
      s1.threads.create({ repoOwner: 'octo', repoName: 'repo', issueNumber: 7 });
      s1.close();

      const s2 = openStore({ path: dbPath });
      const t = s2.threads.findByIssue('octo', 'repo', 7);
      expect(t).not.toBeNull();
      expect(t?.issueNumber).toBe(7);
      s2.close();
    });
  });
});
