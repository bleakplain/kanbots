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

export interface IssueActiveRun {
  id: number;
  status: AgentRunStatus;
  branch: string | null;
  model: string | null;
  startedAt: string;
  currentTool: string | null;
  currentArg: string | null;
  additions: number | null;
  deletions: number | null;
  filesChanged: number | null;
  totalCostUsd?: number | null;
  pendingDecision: { question: string; options: Array<{ value: string; label: string }> } | null;
  checks: {
    typecheck: 'pass' | 'fail' | 'running' | 'idle';
    tests: 'pass' | 'fail' | 'running' | 'idle';
    lint: 'pass' | 'fail' | 'running' | 'idle';
  } | null;
  progress: number | null;
  previewUrl?: string | null;
  previewState?: 'idle' | 'booting' | 'live' | 'crashed' | 'stopped' | null;
}

export interface AgentCheck {
  id: number;
  agentRunId: number;
  kind: 'typecheck' | 'tests' | 'lint' | 'e2e';
  status: 'idle' | 'running' | 'pass' | 'fail';
  startedAt: string;
  finishedAt: string | null;
  summary: string | null;
}

export interface PreviewStatePayload {
  url: string | null;
  state: 'idle' | 'booting' | 'live' | 'crashed' | 'stopped';
  pid: number | null;
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
  activeRun?: IssueActiveRun | null;
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
  worktreePath?: string | null;
  branchName?: string | null;
  pid?: number | null;
  tokenUsageInput?: number | null;
  tokenUsageOutput?: number | null;
  exitReason?: string | null;
  sessionId?: string | null;
  model?: string | null;
  totalCostUsd?: number | null;
  durationMs?: number | null;
  previewUrl?: string | null;
  previewState?: 'idle' | 'booting' | 'live' | 'crashed' | 'stopped' | null;
}

export type AgentEventType = 'text' | 'tool_use' | 'tool_result' | 'error';

export interface AgentEvent {
  id: number;
  agentRunId: number;
  seq: number;
  type: AgentEventType;
  payload: unknown;
  createdAt: string;
}

export type CardType = 'decision' | 'proposed_diff' | 'confirmation' | 'pick_files' | 'result';
export type CardStatus = 'pending' | 'resolved' | 'dismissed';

export interface DecisionPayload {
  question: string;
  options: Array<{ value: string; label: string }>;
}

export interface Card<P = unknown> {
  id: number;
  messageId: number;
  type: CardType;
  payload: P;
  status: CardStatus;
  resolvedValue: unknown;
  resolvedAt: string | null;
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
  mode?: 'github' | 'local';
  repoPath?: string;
  authorLogin?: string;
}

export interface Workspace {
  id: string;
  name: string;
  currentFolderId: string;
}

export interface WorkspaceFolderPayload {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  defaultBranch: string;
  addedAt: string;
  current: boolean;
}

export interface UpdateIssuePatch {
  title?: string;
  body?: string;
  state?: IssueState;
  labels?: string[];
  assignees?: string[];
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface DraftedIssue {
  title: string;
  body: string;
}

export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'other';
  patch: string;
}

export interface DiffPayload {
  base: string;
  branch: string | null;
  files: DiffFile[];
  empty: boolean;
}

export interface PendingDecisionPayload {
  cardId: number;
  runId: number;
  issueNumber: number;
  question: string;
  options: Array<{ value: string; label: string }>;
  createdAt: string;
}
