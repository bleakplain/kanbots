import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureGitignoreEntry } from '../src/gitignore.js';

describe('ensureGitignoreEntry', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kanbots-gitignore-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates .gitignore if missing', async () => {
    const added = await ensureGitignoreEntry(dir, '.kanbots/');
    expect(added).toBe(true);
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe('.kanbots/\n');
  });

  it('appends entry if missing', async () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
    const added = await ensureGitignoreEntry(dir, '.kanbots/');
    expect(added).toBe(true);
    const content = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('.kanbots/');
  });

  it('skips if already present (with trailing slash)', async () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n.kanbots/\n');
    const added = await ensureGitignoreEntry(dir, '.kanbots/');
    expect(added).toBe(false);
  });

  it('skips if already present (without trailing slash)', async () => {
    writeFileSync(join(dir, '.gitignore'), '.kanbots\n');
    const added = await ensureGitignoreEntry(dir, '.kanbots/');
    expect(added).toBe(false);
  });

  it('skips when leading slash is used', async () => {
    writeFileSync(join(dir, '.gitignore'), '/.kanbots/\n');
    const added = await ensureGitignoreEntry(dir, '.kanbots/');
    expect(added).toBe(false);
  });

  it('appends with separator if no trailing newline', async () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules');
    await ensureGitignoreEntry(dir, '.kanbots/');
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe('node_modules\n.kanbots/\n');
  });
});
