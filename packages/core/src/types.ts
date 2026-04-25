export type IssueState = 'open' | 'closed';

export interface User {
  login: string;
  avatarUrl: string | null;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: IssueState;
  labels: string[];
  assignees: string[];
  user: User;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  htmlUrl: string;
  isPullRequest: boolean;
}

export interface Comment {
  id: number;
  body: string;
  user: User;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface Label {
  name: string;
  color: string;
  description: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: IssueState;
  draft: boolean;
  htmlUrl: string;
  head: string;
  base: string;
}

export interface Repo {
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface UpdateIssuePatch {
  title?: string;
  body?: string;
  state?: IssueState;
  labels?: string[];
  assignees?: string[];
}

export interface OpenPRInput {
  title: string;
  body?: string;
  head: string;
  base?: string;
  draft?: boolean;
  issueNumber?: number;
}
