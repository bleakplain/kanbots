import type { Comment, Issue, UpdateIssuePatch } from '@kanbots/core';
import { openStoreInMemory, type Store } from '@kanbots/local-store';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import type { ApiGitHubClient } from '../../src/routes/issues.js';

interface ApiError extends Error {
  status: number;
}

function apiError(status: number, message: string): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  return err;
}

export class FakeApiClient implements ApiGitHubClient {
  private readonly issuesByState = new Map<string, Issue[]>();
  private readonly issuesByNumber = new Map<number, Issue>();
  private readonly commentsByIssue = new Map<number, Comment[]>();
  private nextCommentId = 1;

  failNextUpdateWith: ApiError | null = null;
  failNextAddCommentWith: ApiError | null = null;

  setIssues(state: 'open' | 'closed' | 'all', issues: Issue[]): void {
    this.issuesByState.set(state, issues);
    for (const issue of issues) {
      this.issuesByNumber.set(issue.number, issue);
    }
  }

  setIssue(issue: Issue): void {
    this.issuesByNumber.set(issue.number, issue);
  }

  setComments(n: number, comments: Comment[]): void {
    this.commentsByIssue.set(n, comments);
  }

  failUpdate(status: number, message = 'fake update failure'): void {
    this.failNextUpdateWith = apiError(status, message);
  }

  failAddComment(status: number, message = 'fake comment failure'): void {
    this.failNextAddCommentWith = apiError(status, message);
  }

  async listIssues(opts: { state?: 'open' | 'closed' | 'all' } = {}): Promise<Issue[]> {
    return this.issuesByState.get(opts.state ?? 'open') ?? [];
  }

  async getIssue(n: number): Promise<Issue> {
    const issue = this.issuesByNumber.get(n);
    if (!issue) throw apiError(404, `Issue #${n} not found`);
    return issue;
  }

  async listComments(n: number): Promise<Comment[]> {
    return this.commentsByIssue.get(n) ?? [];
  }

  async updateIssue(n: number, patch: UpdateIssuePatch): Promise<Issue> {
    if (this.failNextUpdateWith) {
      const err = this.failNextUpdateWith;
      this.failNextUpdateWith = null;
      throw err;
    }
    const existing = this.issuesByNumber.get(n);
    if (!existing) throw apiError(404, `Issue #${n} not found`);
    const updated: Issue = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
      ...(patch.assignees !== undefined ? { assignees: patch.assignees } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.issuesByNumber.set(n, updated);
    return updated;
  }

  async addComment(n: number, body: string): Promise<Comment> {
    if (this.failNextAddCommentWith) {
      const err = this.failNextAddCommentWith;
      this.failNextAddCommentWith = null;
      throw err;
    }
    const id = this.nextCommentId++;
    const now = new Date().toISOString();
    const comment: Comment = {
      id,
      body,
      user: { login: 'tester', avatarUrl: null },
      createdAt: now,
      updatedAt: now,
      htmlUrl: `https://github.com/octo/hello/issues/${n}#issuecomment-${id}`,
    };
    const arr = this.commentsByIssue.get(n) ?? [];
    arr.push(comment);
    this.commentsByIssue.set(n, arr);
    return comment;
  }
}

export interface TestApp {
  app: Express;
  client: FakeApiClient;
  store: Store;
}

export function makeTestApp(): TestApp {
  const client = new FakeApiClient();
  const store = openStoreInMemory();
  const app = createApp({
    client,
    store,
    config: { owner: 'octo', repo: 'hello' },
  });
  return { app, client, store };
}
