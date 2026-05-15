import { exec } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { ipcMain, type WebContents } from 'electron';

/**
 * Workspace file-tree IPC. Drives the VSCode-style tree in the LeftRail.
 *
 * Two responsibilities:
 *
 *   1. read-dir(rootPath, relPath) — lazy directory listing. Returns
 *      one level at a time so opening a large repo doesn't block the
 *      renderer.
 *
 *   2. worktree-status(rootPath) — runs `git worktree list` + a
 *      `git status --porcelain` pass over each worktree (and the main
 *      checkout). Returns a map of repo-relative-paths to {status,
 *      worktrees[]} so the tree can badge touched files.
 *
 * Live "touched right now" updates also flow on the broadcast channel
 * `workspace:touched` (see broadcastWorkspaceTouched). The renderer
 * unions the polled worktree-status snapshot with the live stream so
 * a file an agent is editing this very second flips the badge before
 * the next git poll.
 *
 * Path safety: every IPC path is resolved against the root and we
 * refuse anything that escapes it — defends against a compromised
 * renderer asking for ../etc/passwd.
 */

const execAsync = promisify(exec);

const HIDDEN_EXCLUDES = new Set<string>([
  '.git',
  '.DS_Store',
  '.kanbots',
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  '.cache',
]);

export interface TreeEntry {
  name: string;
  /** Repo-relative path with forward slashes. */
  path: string;
  type: 'file' | 'dir';
}

export interface WorktreeStatusMap {
  /** Map of repo-relative-path (forward slashes) to status info. */
  files: Record<
    string,
    {
      status: 'M' | 'A' | 'D' | 'R' | '??' | 'U';
      worktrees: string[];
    }
  >;
  /** Absolute paths of every worktree scanned (incl. main checkout). */
  worktrees: string[];
}

/**
 * Resolve a user-provided sub-path against the workspace root. Returns
 * the absolute path only if it stays inside the root; otherwise null.
 */
function resolveSafe(root: string, rel: string): string | null {
  if (rel.length === 0) return root;
  const absRoot = resolve(root);
  const target = resolve(absRoot, normalize(rel));
  if (target !== absRoot && !target.startsWith(absRoot + sep)) return null;
  return target;
}

async function listWorktrees(rootPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: rootPath,
      timeout: 5_000,
      maxBuffer: 1_048_576,
    });
    const paths: string[] = [];
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        paths.push(line.slice('worktree '.length).trim());
      }
    }
    return paths;
  } catch {
    // Not a git repo or git missing: treat the root itself as the only
    // "worktree" so file status still flows through `git status` below.
    return [rootPath];
  }
}

async function statusForWorktree(
  worktreePath: string,
): Promise<Array<{ path: string; status: string }>> {
  try {
    const { stdout } = await execAsync('git status --porcelain=v1 -z', {
      cwd: worktreePath,
      timeout: 5_000,
      maxBuffer: 4_194_304,
    });
    const out: Array<{ path: string; status: string }> = [];
    // Porcelain v1 with -z uses NUL-terminated records; the 2-char
    // status code is at positions 0-1, then a space, then the path.
    // Rename/copy records carry the old path too, separated by another
    // NUL; we only care about the destination path.
    const records = stdout.split('\0');
    for (let i = 0; i < records.length; i += 1) {
      const r = records[i];
      if (!r || r.length < 3) continue;
      const code = r.slice(0, 2).trim();
      const path = r.slice(3);
      if (code.length === 0 || path.length === 0) continue;
      out.push({ path, status: code });
      // R/C records consume the next NUL-separated source path.
      if (code.startsWith('R') || code.startsWith('C')) i += 1;
    }
    return out;
  } catch {
    return [];
  }
}

function normaliseStatus(code: string): WorktreeStatusMap['files'][string]['status'] {
  if (code === '??') return '??';
  if (code.includes('U') || code === 'AA' || code === 'DD') return 'U';
  if (code.startsWith('R')) return 'R';
  if (code.startsWith('D') || code.endsWith('D')) return 'D';
  if (code.startsWith('A')) return 'A';
  return 'M';
}

async function readDirEntries(rootPath: string, relPath: string): Promise<TreeEntry[]> {
  const absDir = resolveSafe(rootPath, relPath);
  if (absDir === null) return [];
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: TreeEntry[] = [];
  for (const ent of entries) {
    if (HIDDEN_EXCLUDES.has(ent.name)) continue;
    if (ent.name.startsWith('.')) {
      // Show dotfiles but skip the well-known dot directories already
      // captured in HIDDEN_EXCLUDES. Hidden files (.env etc.) stay
      // visible — the tree mirrors the user's source tree.
    }
    const isDir = ent.isDirectory();
    if (!isDir && !ent.isFile()) continue;
    const childRel = (relPath.length === 0 ? ent.name : `${relPath}/${ent.name}`).replace(/\\/g, '/');
    out.push({ name: ent.name, path: childRel, type: isDir ? 'dir' : 'file' });
  }
  // Folders first, then files, both alphabetised.
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

async function worktreeStatus(rootPath: string): Promise<WorktreeStatusMap> {
  const worktrees = await listWorktrees(rootPath);
  const files: WorktreeStatusMap['files'] = {};
  for (const wt of worktrees) {
    const status = await statusForWorktree(wt);
    if (status.length === 0) continue;
    for (const { path, status: code } of status) {
      // For an agent worktree, the same file may show up under a
      // different repo-relative path than the main checkout (worktree
      // root differs). Normalise to "relative to wt itself" — the
      // renderer matches against the file tree it reads from `rootPath`,
      // and for the main checkout that's the same path; for agent
      // worktrees we just want the user to know "something elsewhere
      // is touching X" so the path-as-key still surfaces correctly.
      const rel = path.replace(/\\/g, '/');
      const prev = files[rel];
      if (prev === undefined) {
        files[rel] = { status: normaliseStatus(code), worktrees: [wt] };
      } else if (!prev.worktrees.includes(wt)) {
        prev.worktrees.push(wt);
      }
    }
  }
  return { files, worktrees };
}

let resolveRoot: (() => string | null) | null = null;
let broadcaster: ((payload: { filePath: string; worktreePath: string | null }) => void) | null = null;
const senders = new Set<WebContents>();

export interface WorkspaceTreeIpcOptions {
  /**
   * Returns the absolute path of the current local repo root, or null
   * if no workspace (cloud or local) is currently open / no cloud
   * project is bound to a local repo yet.
   */
  getCurrentRepoRoot: () => string | null;
}

export function registerWorkspaceTreeIpc(opts: WorkspaceTreeIpcOptions): void {
  resolveRoot = opts.getCurrentRepoRoot;

  ipcMain.handle(
    'kanbots:workspace:current-root',
    async (): Promise<{ repoRoot: string | null }> => ({
      repoRoot: resolveRoot ? resolveRoot() : null,
    }),
  );

  ipcMain.handle(
    'kanbots:workspace:read-dir',
    async (
      _event,
      args: { rootPath: string; relPath: string },
    ): Promise<TreeEntry[]> => {
      const root = resolveRoot ? resolveRoot() : null;
      // The renderer always sends rootPath echoed back from
      // current-root, but we re-verify against the live root so a
      // stale renderer can't read from a closed-workspace path.
      if (root === null || resolve(args.rootPath) !== resolve(root)) return [];
      if (!isAbsolute(root)) return [];
      try {
        const s = await stat(root);
        if (!s.isDirectory()) return [];
      } catch {
        return [];
      }
      return readDirEntries(root, args.relPath ?? '');
    },
  );

  ipcMain.handle(
    'kanbots:workspace:worktree-status',
    async (_event, args: { rootPath: string }): Promise<WorktreeStatusMap> => {
      const root = resolveRoot ? resolveRoot() : null;
      if (root === null || resolve(args.rootPath) !== resolve(root)) {
        return { files: {}, worktrees: [] };
      }
      return worktreeStatus(root);
    },
  );

  ipcMain.handle('kanbots:workspace:subscribe-touched', async (event): Promise<void> => {
    const wc = event.sender;
    if (senders.has(wc)) return;
    senders.add(wc);
    wc.on('destroyed', () => senders.delete(wc));
  });

  broadcaster = (payload) => {
    for (const wc of senders) {
      if (wc.isDestroyed()) {
        senders.delete(wc);
        continue;
      }
      try {
        wc.send('kanbots:workspace:touched', payload);
      } catch {
        // ignore broken sender
      }
    }
  };
}

/**
 * Forward a file edit from a live agent run to subscribed renderers.
 * Callers: the cloud run dispatcher and the local supervisor's stream
 * handler, when they see a tool_use event whose tool is Edit / Write /
 * MultiEdit. `filePath` is whatever the tool received — we don't
 * normalise here because matching is done renderer-side against the
 * file tree's repo-relative paths (suffix match).
 */
export function broadcastWorkspaceTouched(payload: {
  filePath: string;
  worktreePath: string | null;
}): void {
  if (broadcaster !== null) broadcaster(payload);
}

/**
 * Best-effort relative-path-from-root computer for callers that have
 * an absolute file path but want to emit something the tree can match.
 */
export function repoRelativePath(absPath: string): string | null {
  const root = resolveRoot ? resolveRoot() : null;
  if (root === null) return null;
  const rel = relative(root, absPath);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

