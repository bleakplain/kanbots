import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { IssueSource } from '@kanbots/core';
import type { Store } from '@kanbots/local-store';
import { Router } from 'express';
import { z } from 'zod';
import type { AgentSupervisor } from '../agent-runs/supervisor.js';

const execFileAsync = promisify(execFile);

const issueNumberSchema = z.coerce.number().int().positive();
const runIdSchema = z.coerce.number().int().positive();

const splitSchema = z
  .object({
    subtasks: z
      .array(
        z
          .object({
            title: z.string().min(1).max(200),
            body: z.string().max(20_000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    dispatch: z.boolean().optional(),
  })
  .strict();

const reviewerSchema = z
  .object({
    threadId: z.number().int().positive().optional(),
    prompt: z.string().min(1).max(20_000).optional(),
    model: z.string().min(1).max(120).optional(),
  })
  .strict()
  .optional();

const REVIEWER_SYSTEM_PROMPT = `You are a code reviewer for a kanbots task.

Your job is to read the diff already in this worktree and produce a focused review.

1. Run \`git diff\` to read the changes.
2. Read the linked issue body (the user's prompt has it).
3. Identify: bugs, missed edge cases, places where the change diverges from the
   issue's acceptance criteria, opportunities to simplify.
4. Emit your review as a single text response. Do NOT modify code. Do NOT
   commit. Do NOT spawn checks.
5. End your turn after the review.`;

export interface AgentActionsDeps {
  store: Store;
  source: IssueSource;
  supervisor: AgentSupervisor;
}

export function agentActionsRouter(deps: AgentActionsDeps): Router {
  const router = Router();

  // Fork: create a fresh run in a sibling worktree starting from the current
  // HEAD of the source worktree.
  router.post('/agent-runs/:id/fork', async (req, res) => {
    const id = runIdSchema.parse(req.params.id);
    const source = deps.store.agentRuns.findById(id);
    if (!source) {
      res.status(404).json({ error: 'NotFound', message: `run ${id} not found` });
      return;
    }
    if (!source.worktreePath || !source.branchName) {
      res
        .status(400)
        .json({ error: 'BadRequest', message: 'source run has no worktree to fork from' });
      return;
    }
    try {
      // Find the parent issue / thread.
      const thread = deps.store.threads.findById(source.threadId);
      if (!thread) {
        res
          .status(400)
          .json({ error: 'BadRequest', message: 'source run has no thread' });
        return;
      }
      // Get the source HEAD so we can branch from it.
      const { stdout: headSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: source.worktreePath,
      });
      const sha = headSha.trim();
      const newBranch = `${source.branchName}-fork-${Date.now().toString(36)}`;
      const newWorktreePath = `${source.worktreePath}-fork-${Date.now().toString(36)}`;
      await mkdir(dirname(newWorktreePath), { recursive: true });
      // Create the fork worktree against the source SHA.
      await execFileAsync(
        'git',
        ['worktree', 'add', '-b', newBranch, newWorktreePath, sha],
        { cwd: source.worktreePath },
      );
      // Spawn a new run pointing at the fork. Use a generic kickoff prompt;
      // the user can supply more context in the inspector.
      const run = await deps.supervisor.start({
        threadId: thread.id,
        issueNumber: thread.issueNumber,
        prompt: `Continue from a fork of run #${id} (branch ${source.branchName}).`,
        ...(source.model ? { model: source.model } : {}),
      });
      res.status(201).json({ source: id, run, worktree: newWorktreePath, branch: newBranch });
    } catch (err) {
      res.status(500).json({
        error: 'ForkFailed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Reviewer: spawn a separate agent run with the reviewer system prompt.
  router.post('/issues/:n/reviewer', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    const parsed = (req.body !== undefined ? reviewerSchema.parse(req.body) : undefined) ?? {};
    try {
      const issue = await deps.source.getIssue(n);
      // Find or create a thread for this issue using the supervisor's normal start path.
      // The supervisor expects a threadId, so look up the existing thread for the issue.
      let threadId = parsed.threadId;
      if (threadId === undefined) {
        // Use the issue's own thread (any repo namespace works since the workspace is single-repo).
        const existingThread = findThreadForIssue(deps.store, n);
        if (existingThread) {
          threadId = existingThread.id;
        } else {
          res.status(400).json({
            error: 'BadRequest',
            message:
              'no thread for this issue yet — send a message first or pass threadId explicitly',
          });
          return;
        }
      }
      const reviewerPrompt =
        parsed.prompt ??
        `Review the implementation against the issue:\n\n${issue.title}\n\n${issue.body ?? ''}`;
      const run = await deps.supervisor.start({
        threadId,
        issueNumber: n,
        prompt: reviewerPrompt,
        appendSystemPrompt: REVIEWER_SYSTEM_PROMPT,
        ...(parsed.model ? { model: parsed.model } : {}),
      });
      res.status(201).json(run);
    } catch (err) {
      res.status(500).json({
        error: 'ReviewerFailed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Split: spawn child issues linked to the parent. Optionally dispatch agents
  // for each child (best-effort; failures don't roll back the issues).
  router.post('/issues/:n/split', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    const parsed = splitSchema.parse(req.body);
    try {
      const parent = await deps.source.getIssue(n);
      const labels = (parent.labels ?? []).filter(
        (l) => !l.startsWith('status:') && !l.startsWith('agent:'),
      );
      const created = [];
      for (const sub of parsed.subtasks) {
        const child = await deps.source.createIssue({
          title: sub.title,
          ...(sub.body !== undefined ? { body: sub.body } : {}),
          labels: [...labels, 'status:backlog', `parent:${n}`],
        });
        created.push(child);
        if (parsed.dispatch) {
          // Best-effort dispatch — set up a thread + initial message + run.
          const thread = ensureThread(deps.store, child.number);
          deps.store.messages.create({
            threadId: thread.id,
            role: 'user',
            body: sub.body ?? sub.title,
          });
          try {
            await deps.supervisor.start({
              threadId: thread.id,
              issueNumber: child.number,
              prompt: sub.body ?? sub.title,
            });
          } catch {
            // Surfaced via run rows; child issue still created.
          }
        }
      }
      res.status(201).json({ parent: n, children: created });
    } catch (err) {
      res.status(500).json({
        error: 'InternalError',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Approve & merge / Request changes for review-state issues.
  router.post('/issues/:n/pr/approve', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    try {
      const issue = await deps.source.getIssue(n);
      const labels = issue.labels.filter(
        (l) => !l.startsWith('status:') && !l.startsWith('agent:'),
      );
      labels.push('status:done', 'agent:idle');
      const updated = await deps.source.updateIssue(n, { labels, state: 'closed' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({
        error: 'InternalError',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post('/issues/:n/archive', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    try {
      const thread = findThreadForIssue(deps.store, n);
      if (thread) {
        const runs = deps.store.agentRuns
          .listByThread(thread.id)
          .filter((r) => r.status === 'starting' || r.status === 'running' || r.status === 'awaiting_input');
        for (const run of runs) {
          await deps.supervisor.stop(run.id);
        }
      }
      const issue = await deps.source.getIssue(n);
      const labels = issue.labels.filter(
        (l) => !l.startsWith('status:') && !l.startsWith('agent:') && l !== 'archived',
      );
      labels.push('archived');
      const updated = await deps.source.updateIssue(n, { labels, state: 'closed' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({
        error: 'ArchiveFailed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post('/issues/:n/pr/request-changes', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    try {
      const issue = await deps.source.getIssue(n);
      const labels = issue.labels.filter(
        (l) => !l.startsWith('status:') && !l.startsWith('agent:'),
      );
      labels.push('status:in-progress', 'agent:blocked');
      const updated = await deps.source.updateIssue(n, { labels });
      res.json(updated);
    } catch (err) {
      res.status(500).json({
        error: 'InternalError',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}

// findThreadForIssue searches all threads for one matching the issue number.
// In single-repo workspaces this returns the unique thread; multi-repo would
// need a config-aware lookup but that's out of scope here.
function findThreadForIssue(
  store: Store,
  issueNumber: number,
): { id: number; issueNumber: number } | null {
  const all = store.threads.list();
  return all.find((t) => t.issueNumber === issueNumber) ?? null;
}

function ensureThread(store: Store, issueNumber: number): { id: number } {
  const existing = findThreadForIssue(store, issueNumber);
  if (existing) return { id: existing.id };
  return store.threads.create({
    repoOwner: 'local',
    repoName: 'split',
    issueNumber,
  });
}
