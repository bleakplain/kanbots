import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
