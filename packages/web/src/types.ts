export type IssueState = 'open' | 'closed';
export type StatusKey = 'backlog' | 'todo' | 'inProgress' | 'review' | 'done';
export type AgentKey = 'idle' | 'queued' | 'running' | 'blocked' | 'review' | 'failed';
export type Role = 'user' | 'agent' | 'system';
export type AgentRunStatus =
  | 'starting'
  | 'running'
  | 'awaiting_input'
  | 'complete'
  | 'failed'
  | 'stopped';

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
  status: StatusKey | null;
  agent: AgentKey | null;
}

export interface Comment {
  id: number;
  body: string;
  user: User;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface Message {
  id: number;
  threadId: number;
  role: Role;
  body: string;
  createdAt: string;
  agentRunId: number | null;
  promotedGithubCommentId: number | null;
  promotedAt: string | null;
}

export interface AgentRun {
  id: number;
  threadId: number;
  status: AgentRunStatus;
  startedAt: string;
  endedAt: string | null;
}

export interface Thread {
  id: number;
  createdAt: string;
  messages: Message[];
  activeRun: AgentRun | null;
}

export interface IssueDetail {
  issue: Issue;
  comments: Comment[];
  thread: Thread | null;
}

export interface Config {
  owner: string;
  repo: string;
}

export interface UpdateIssuePatch {
  title?: string;
  body?: string;
  state?: IssueState;
  labels?: string[];
  assignees?: string[];
}
