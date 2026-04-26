import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface KanbotsDir {
  root: string;
  dbPath: string;
  worktreesDir: string;
  configPath: string;
}

export type WorkspaceMode = 'github' | 'local';

export interface GitHubWorkspaceConfig {
  mode: 'github';
  owner: string;
  repo: string;
}

export interface LocalWorkspaceConfig {
  mode: 'local';
  name: string;
  authorLogin: string;
}

export type WorkspaceConfig = GitHubWorkspaceConfig | LocalWorkspaceConfig;

export function describeKanbotsDir(repoPath: string): KanbotsDir {
  const root = join(repoPath, '.kanbots');
  return {
    root,
    dbPath: join(root, 'db.sqlite'),
    worktreesDir: join(root, 'worktrees'),
    configPath: join(root, 'config.json'),
  };
}

export async function ensureKanbotsDir(repoPath: string): Promise<KanbotsDir> {
  const dir = describeKanbotsDir(repoPath);
  await mkdir(dir.worktreesDir, { recursive: true });
  return dir;
}

export async function readWorkspaceConfig(repoPath: string): Promise<WorkspaceConfig | null> {
  const { configPath } = describeKanbotsDir(repoPath);
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return validateConfig(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeWorkspaceConfig(
  repoPath: string,
  config: WorkspaceConfig,
): Promise<void> {
  const { configPath } = describeKanbotsDir(repoPath);
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function validateConfig(input: unknown): WorkspaceConfig | null {
  if (typeof input !== 'object' || input === null) return null;
  const obj = input as Record<string, unknown>;
  if (obj.mode === 'github' && typeof obj.owner === 'string' && typeof obj.repo === 'string') {
    return { mode: 'github', owner: obj.owner, repo: obj.repo };
  }
  if (obj.mode === 'local' && typeof obj.name === 'string' && typeof obj.authorLogin === 'string') {
    return { mode: 'local', name: obj.name, authorLogin: obj.authorLogin };
  }
  return null;
}

export async function findGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveGitUserName(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['config', 'user.name'], {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    const name = stdout.trim();
    if (name) return name;
  } catch {
    // fall through
  }
  return 'you';
}

export async function ensureGitignoreEntry(gitRoot: string, entry: string): Promise<boolean> {
  const path = join(gitRoot, '.gitignore');

  if (!existsSync(path)) {
    await writeFile(path, `${entry}\n`, 'utf-8');
    return true;
  }

  const content = await readFile(path, 'utf-8');
  const target = entry.replace(/\/+$/, '');
  const present = content.split('\n').some((line) => {
    const cleaned = line.trim().replace(/^\/+|\/+$/g, '');
    return cleaned === target;
  });

  if (present) return false;

  const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  await appendFile(path, `${sep}${entry}\n`, 'utf-8');
  return true;
}
