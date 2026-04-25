import {
  agentFromLabels,
  statusFromLabels,
  type AgentKey,
  type Comment,
  type Issue,
  type StatusKey,
  type UpdateIssuePatch,
} from '@kanbots/core';
import type { Store } from '@kanbots/local-store';
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

export interface ApiGitHubClient {
  listIssues(opts?: { state?: 'open' | 'closed' | 'all' }): Promise<Issue[]>;
  getIssue(n: number): Promise<Issue>;
  listComments(n: number): Promise<Comment[]>;
  updateIssue(n: number, patch: UpdateIssuePatch): Promise<Issue>;
  addComment(n: number, body: string): Promise<Comment>;
}

export interface IssuesDeps {
  client: ApiGitHubClient;
  store: Store;
  config: ConfigPayload;
}

export interface DecoratedIssue extends Issue {
  status: StatusKey | null;
  agent: AgentKey | null;
}

export function decorateIssue(issue: Issue): DecoratedIssue {
  return {
    ...issue,
    status: statusFromLabels(issue.labels),
    agent: agentFromLabels(issue.labels),
  };
}

export function issuesRouter(deps: IssuesDeps): Router {
  const router = Router();

  router.get('/issues', async (req, res) => {
    const state = issueListStateSchema.parse(req.query.state);
    const issues = await deps.client.listIssues(state ? { state } : {});
    res.json(issues.map(decorateIssue));
  });

  router.get('/issues/:n', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);

    const [issue, comments] = await Promise.all([
      deps.client.getIssue(n),
      deps.client.listComments(n),
    ]);

    const thread = deps.store.threads.findByIssue(deps.config.owner, deps.config.repo, n);
    const threadPayload = thread
      ? {
          id: thread.id,
          createdAt: thread.createdAt,
          messages: deps.store.messages.list(thread.id),
          activeRun: deps.store.agentRuns.findActiveForThread(thread.id),
        }
      : null;

    res.json({
      issue: decorateIssue(issue),
      comments,
      thread: threadPayload,
    });
  });

  router.patch('/issues/:n', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    const patch = updatePatchSchema.parse(req.body);
    const issue = await deps.client.updateIssue(n, patch);
    res.json(decorateIssue(issue));
  });

  router.post('/issues/:n/comments', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    const { body } = commentBodySchema.parse(req.body);
    const comment = await deps.client.addComment(n, body);
    res.status(201).json(comment);
  });

  return router;
}
