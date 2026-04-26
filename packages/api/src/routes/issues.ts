import {
  agentFromLabels,
  statusFromLabels,
  type AgentKey,
  type CreateIssueInput,
  type Issue,
  type IssueSource,
  type StatusKey,
  type UpdateIssuePatch,
} from '@kanbots/core';
import type { AgentRunStatus, Store } from '@kanbots/local-store';
import { Router } from 'express';
import { z } from 'zod';
import type { ConfigPayload } from './config.js';

const issueListStateSchema = z.enum(['open', 'closed', 'all']).optional();
const issueNumberSchema = z.coerce.number().int().positive();

const updatePatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    state: z.enum(['open', 'closed']).optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
  })
  .strict();

const commentBodySchema = z
  .object({
    body: z.string().min(1).max(65_536),
  })
  .strict();

const messageBodySchema = z
  .object({
    body: z.string().min(1).max(65_536),
  })
  .strict();

const createIssueSchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().max(65_536).optional(),
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
  })
  .strict();

export interface IssuesDeps {
  source: IssueSource;
  store: Store;
  config: ConfigPayload;
}

export interface IssueActiveRunPayload {
  id: number;
  status: AgentRunStatus;
  branch: string | null;
  model: string | null;
  startedAt: string;
  currentTool: string | null;
  currentArg: string | null;
  totalCostUsd: number | null;
  pendingDecision:
    | { question: string; options: Array<{ value: string; label: string }> }
    | null;
  checks: {
    typecheck: 'pass' | 'fail' | 'running' | 'idle';
    tests: 'pass' | 'fail' | 'running' | 'idle';
    lint: 'pass' | 'fail' | 'running' | 'idle';
  } | null;
  previewUrl: string | null;
  previewState: string | null;
}

export interface DecoratedIssue extends Issue {
  status: StatusKey | null;
  agent: AgentKey | null;
  activeRun: IssueActiveRunPayload | null;
}

export function decorateIssue(
  issue: Issue,
  activeRun: IssueActiveRunPayload | null = null,
): DecoratedIssue {
  return {
    ...issue,
    status: statusFromLabels(issue.labels),
    agent: agentFromLabels(issue.labels),
    activeRun,
  };
}

function buildActiveRunMap(
  deps: IssuesDeps,
): Map<number, IssueActiveRunPayload> {
  const out = new Map<number, IssueActiveRunPayload>();
  const active = deps.store.agentRuns.listActiveForRepo(
    deps.config.owner,
    deps.config.repo,
  );
  if (active.length === 0) return out;
  const runIds = active.map((r) => r.id);
  const latestTool = deps.store.events.findLatestToolUseByRun(runIds);
  const pending = deps.store.cards.findPendingByRuns(runIds);
  const checksByRun = deps.store.checks.findLatestByRunsAndKinds(runIds);
  for (const row of active) {
    const tool = latestTool.get(row.id);
    let toolName: string | null = null;
    let toolArg: string | null = null;
    if (tool && tool.type === 'tool_use') {
      const p = tool.payload as { name?: string; input?: unknown } | null;
      toolName = p?.name ?? null;
      const input = p?.input;
      if (typeof input === 'string') {
        toolArg = input;
      } else if (input !== null && typeof input === 'object') {
        try {
          toolArg = JSON.stringify(input);
        } catch {
          toolArg = null;
        }
      }
    }
    const card = pending.get(row.id);
    let decision: IssueActiveRunPayload['pendingDecision'] = null;
    if (card && card.type === 'decision') {
      const p = card.payload as
        | { question?: string; options?: Array<{ value?: string; label?: string }> }
        | undefined;
      if (p && typeof p.question === 'string' && Array.isArray(p.options)) {
        const options = p.options
          .filter((o): o is { value: string; label: string } =>
            typeof o?.value === 'string' && typeof o?.label === 'string',
          )
          .map((o) => ({ value: o.value, label: o.label }));
        if (options.length > 0) decision = { question: p.question, options };
      }
    }
    const checkMap = checksByRun.get(row.id);
    const checksPayload = checkMap
      ? {
          typecheck: (checkMap.get('typecheck')?.status ?? 'idle') as
            | 'pass'
            | 'fail'
            | 'running'
            | 'idle',
          tests: (checkMap.get('tests')?.status ?? 'idle') as
            | 'pass'
            | 'fail'
            | 'running'
            | 'idle',
          lint: (checkMap.get('lint')?.status ?? 'idle') as
            | 'pass'
            | 'fail'
            | 'running'
            | 'idle',
        }
      : null;
    out.set(row.issueNumber, {
      id: row.id,
      status: row.status,
      branch: row.branchName,
      model: row.model,
      startedAt: row.startedAt,
      currentTool: toolName,
      currentArg: toolArg,
      totalCostUsd: row.totalCostUsd,
      pendingDecision: decision,
      checks: checksPayload,
      previewUrl: row.previewUrl,
      previewState: row.previewState,
    });
  }
  return out;
}

function buildThreadPayload(deps: IssuesDeps, threadId: number) {
  const thread = deps.store.threads.findById(threadId);
  if (!thread) return null;
  return {
    id: thread.id,
    createdAt: thread.createdAt,
    messages: deps.store.messages.list(thread.id),
    activeRun: deps.store.agentRuns.findActiveForThread(thread.id),
  };
}

export function issuesRouter(deps: IssuesDeps): Router {
  const router = Router();

  router.get('/issues', async (req, res) => {
    const state = issueListStateSchema.parse(req.query.state);
    const issues = await deps.source.listIssues(state ? { state } : {});
    const activeRunMap = buildActiveRunMap(deps);
    res.json(issues.map((issue) => decorateIssue(issue, activeRunMap.get(issue.number) ?? null)));
  });

  router.post('/issues', async (req, res) => {
    const parsed = createIssueSchema.parse(req.body);
    const input: CreateIssueInput = {
      title: parsed.title,
      ...(parsed.body !== undefined ? { body: parsed.body } : {}),
      ...(parsed.labels !== undefined ? { labels: parsed.labels } : {}),
      ...(parsed.assignees !== undefined ? { assignees: parsed.assignees } : {}),
    };
    const issue = await deps.source.createIssue(input);
    res.status(201).json(decorateIssue(issue));
  });

  router.get('/issues/:n', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);

    const [issue, comments] = await Promise.all([
      deps.source.getIssue(n),
      deps.source.listComments(n),
    ]);

    const thread = deps.store.threads.findByIssue(deps.config.owner, deps.config.repo, n);
    const threadPayload = thread ? buildThreadPayload(deps, thread.id) : null;
    const activeRunMap = buildActiveRunMap(deps);

    res.json({
      issue: decorateIssue(issue, activeRunMap.get(n) ?? null),
      comments,
      thread: threadPayload,
    });
  });

  router.patch('/issues/:n', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    const parsed = updatePatchSchema.parse(req.body);
    const patch: UpdateIssuePatch = {
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.body !== undefined ? { body: parsed.body } : {}),
      ...(parsed.state !== undefined ? { state: parsed.state } : {}),
      ...(parsed.labels !== undefined ? { labels: parsed.labels } : {}),
      ...(parsed.assignees !== undefined ? { assignees: parsed.assignees } : {}),
    };
    const issue = await deps.source.updateIssue(n, patch);
    res.json(decorateIssue(issue));
  });

  router.post('/issues/:n/comments', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    const { body } = commentBodySchema.parse(req.body);
    const comment = await deps.source.addComment(n, body);
    res.status(201).json(comment);
  });

  router.post('/issues/:n/messages', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    const { body } = messageBodySchema.parse(req.body);

    const thread = deps.store.threads.getOrCreate({
      repoOwner: deps.config.owner,
      repoName: deps.config.repo,
      issueNumber: n,
    });
    const message = deps.store.messages.create({
      threadId: thread.id,
      role: 'user',
      body,
    });

    res.status(201).json({
      message,
      thread: buildThreadPayload(deps, thread.id),
    });
  });

  router.get('/issues/:n/runs', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    const thread = deps.store.threads.findByIssue(deps.config.owner, deps.config.repo, n);
    if (!thread) {
      res.json([]);
      return;
    }
    const runs = deps.store.agentRuns.listByThread(thread.id);
    // Most recent first
    runs.sort((a, b) => b.id - a.id);
    res.json(runs);
  });

  return router;
}
