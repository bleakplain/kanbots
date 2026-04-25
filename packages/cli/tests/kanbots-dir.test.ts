import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeKanbotsDir, ensureKanbotsDir } from '../src/kanbots-dir.js';

describe('kanbots-dir', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kanbots-dir-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('describeKanbotsDir returns expected paths', () => {
    const k = describeKanbotsDir(dir);
    expect(k.root).toBe(join(dir, '.kanbots'));
    expect(k.dbPath).toBe(join(dir, '.kanbots', 'db.sqlite'));
    expect(k.worktreesDir).toBe(join(dir, '.kanbots', 'worktrees'));
  });

  it('ensureKanbotsDir creates the directory and worktrees subdir', async () => {
    const k = await ensureKanbotsDir(dir);
    expect(existsSync(k.root)).toBe(true);
    expect(existsSync(k.worktreesDir)).toBe(true);
  });

  it('is idempotent on a re-run', async () => {
    await ensureKanbotsDir(dir);
    await expect(ensureKanbotsDir(dir)).resolves.toBeDefined();
  });
});
