import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface KanbotsDir {
  root: string;
  dbPath: string;
  worktreesDir: string;
}

export function describeKanbotsDir(gitRoot: string): KanbotsDir {
  const root = join(gitRoot, '.kanbots');
  return {
    root,
    dbPath: join(root, 'db.sqlite'),
    worktreesDir: join(root, 'worktrees'),
  };
}

export async function ensureKanbotsDir(gitRoot: string): Promise<KanbotsDir> {
  const dir = describeKanbotsDir(gitRoot);
  await mkdir(dir.worktreesDir, { recursive: true });
  return dir;
}
