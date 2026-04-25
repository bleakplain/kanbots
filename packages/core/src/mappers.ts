import type { Comment, Issue, IssueState, PullRequest, User } from './types.js';

interface RawUser {
  login?: string;
  avatar_url?: string | null;
}

interface RawLabel {
  name?: string | null;
}

interface RawAssignee {
  login?: string;
}

export interface RawIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  labels: ReadonlyArray<string | RawLabel>;
  assignees?: ReadonlyArray<RawAssignee> | null;
  user: RawUser | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  html_url: string;
  pull_request?: unknown;
}

export interface RawComment {
  id: number;
  body?: string | null;
  user: RawUser | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface RawPullRequest {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  draft?: boolean;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
}

function rawUser(raw: RawUser | null): User {
  return {
    login: raw?.login ?? 'unknown',
    avatarUrl: raw?.avatar_url ?? null,
  };
}

function rawLabels(labels: ReadonlyArray<string | RawLabel>): string[] {
  const out: string[] = [];
  for (const l of labels) {
    if (typeof l === 'string') out.push(l);
    else if (typeof l.name === 'string') out.push(l.name);
  }
  return out;
}

export function rawIssueToIssue(raw: RawIssue): Issue {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    state: raw.state as IssueState,
    labels: rawLabels(raw.labels),
    assignees: (raw.assignees ?? [])
      .map((a) => a.login)
      .filter((l): l is string => typeof l === 'string'),
    user: rawUser(raw.user),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    closedAt: raw.closed_at ?? null,
    htmlUrl: raw.html_url,
    isPullRequest: raw.pull_request != null,
  };
}

export function rawCommentToComment(raw: RawComment): Comment {
  return {
    id: raw.id,
    body: raw.body ?? '',
    user: rawUser(raw.user),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    htmlUrl: raw.html_url,
  };
}

export function rawPullToPullRequest(raw: RawPullRequest): PullRequest {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    state: raw.state as IssueState,
    draft: raw.draft ?? false,
    htmlUrl: raw.html_url,
    head: raw.head.ref,
    base: raw.base.ref,
  };
}
