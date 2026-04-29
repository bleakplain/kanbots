import { execFile } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PRE_PUSH_HOOK = `#!/bin/sh
# Installed by kanbots: agent worktrees must not push to any remote.
# Humans can bypass with \`git push --no-verify\` if absolutely needed.
echo "kanbots: agent worktrees are not allowed to push; commit locally and let the human review." 1>&2
exit 1
`;

async function hardenWorktree(worktreePath: string): Promise<void> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--git-path', 'hooks'], {
    cwd: worktreePath,
  });
  const hooksRel = stdout.trim();
  if (!hooksRel) throw new Error('git rev-parse --git-path hooks returned empty');
  const hooksDir = isAbsolute(hooksRel) ? hooksRel : resolve(worktreePath, hooksRel);
  await mkdir(hooksDir, { recursive: true });
  const hookPath = resolve(hooksDir, 'pre-push');
  await writeFile(hookPath, PRE_PUSH_HOOK, { mode: 0o755 });
  await chmod(hookPath, 0o755);
}

export interface CreateWorktreeInput {
  repoPath: string;
  branch: string;
  worktreePath: string;
  baseRef?: string;
}

export interface Worktree {
  branch: string;
  path: string;
  baseRef: string | null;
}

export async function createWorktree(input: CreateWorktreeInput): Promise<Worktree> {
  const args = ['worktree', 'add', '-b', input.branch, input.worktreePath];
  if (input.baseRef) args.push(input.baseRef);
  await execFileAsync('git', args, { cwd: input.repoPath });
  try {
    await hardenWorktree(input.worktreePath);
  } catch (err) {
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', input.worktreePath], {
        cwd: input.repoPath,
      });
    } catch {
      // best-effort cleanup; surface the original hardening error below
    }
    throw err;
  }
  return {
    branch: input.branch,
    path: input.worktreePath,
    baseRef: input.baseRef ?? null,
  };
}

export interface RemoveWorktreeInput {
  repoPath: string;
  worktreePath: string;
  force?: boolean;
}

export async function removeWorktree(input: RemoveWorktreeInput): Promise<void> {
  const args = ['worktree', 'remove'];
  if (input.force) args.push('--force');
  args.push(input.worktreePath);
  await execFileAsync('git', args, { cwd: input.repoPath });
}

export function defaultWorktreePath(opts: {
  repoPath: string;
  issueNumber: number;
  runId: number;
}): string {
  return `${opts.repoPath}/.kanbots/worktrees/issue-${opts.issueNumber}-${opts.runId}`;
}

export function defaultBranchName(opts: { issueNumber: number; runId: number }): string {
  return `kanbots/issue-${opts.issueNumber}-${opts.runId}`;
}
