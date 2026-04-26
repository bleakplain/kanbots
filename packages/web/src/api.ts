import type {
  AgentCheck,
  AgentRun,
  Card,
  Comment,
  Config,
  CreateIssueInput,
  DiffPayload,
  DraftedIssue,
  Issue,
  IssueDetail,
  Message,
  PendingDecisionPayload,
  PreviewStatePayload,
  Thread,
  UpdateIssuePatch,
  Workspace,
  WorkspaceFolderPayload,
} from './types.js';

export interface ResolveCardResult {
  card: Card;
  run: AgentRun;
}

export interface PostMessageResult {
  message: Message;
  thread: Thread;
}

let baseUrl = '';

export function configureApi(url: string): void {
  baseUrl = url;
}

export function apiUrl(path: string): string {
  return baseUrl + path;
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body != null ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      detail = body.message ? `: ${body.message}` : body.error ? `: ${body.error}` : '';
    } catch {
      // ignore
    }
    throw new Error(`${res.status} ${res.statusText} on ${path}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  config: (): Promise<Config> => send('/api/config'),
  issues: (state: 'open' | 'closed' | 'all' = 'open'): Promise<Issue[]> =>
    send(`/api/issues?state=${state}`),
  issue: (n: number): Promise<IssueDetail> => send(`/api/issues/${n}`),
  updateIssue: (n: number, patch: UpdateIssuePatch): Promise<Issue> =>
    send(`/api/issues/${n}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  addComment: (n: number, body: string): Promise<Comment> =>
    send(`/api/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  postMessage: (n: number, body: string): Promise<PostMessageResult> =>
    send(`/api/issues/${n}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  createIssue: (input: CreateIssueInput): Promise<Issue> =>
    send('/api/issues', { method: 'POST', body: JSON.stringify(input) }),
  draftIssue: (description: string): Promise<DraftedIssue> =>
    send('/api/composer/draft', { method: 'POST', body: JSON.stringify({ description }) }),
  startAgent: (
    issueNumber: number,
    input: {
      threadId: number;
      prompt: string;
      appendSystemPrompt?: string;
      model?: string;
    },
  ): Promise<AgentRun> =>
    send(`/api/issues/${issueNumber}/agent/start`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  stopAgent: (runId: number): Promise<AgentRun> =>
    send(`/api/agent-runs/${runId}/stop`, { method: 'POST' }),
  getAgentRun: (runId: number): Promise<AgentRun> => send(`/api/agent-runs/${runId}`),
  getAgentRunDiff: (runId: number): Promise<DiffPayload> => send(`/api/agent-runs/${runId}/diff`),
  getAgentRunStats: (
    runId: number,
  ): Promise<{ additions: number; deletions: number; filesChanged: number }> =>
    send(`/api/agent-runs/${runId}/stats`),
  listIssueRuns: (issueNumber: number): Promise<AgentRun[]> =>
    send(`/api/issues/${issueNumber}/runs`),
  listPendingDecisions: (): Promise<PendingDecisionPayload[]> => send('/api/decisions/pending'),
  workspace: (): Promise<Workspace> => send('/api/workspace'),
  listFolders: (): Promise<WorkspaceFolderPayload[]> => send('/api/folders'),
  addFolder: (input: {
    name: string;
    path: string;
    defaultBranch?: string;
  }): Promise<WorkspaceFolderPayload> =>
    send('/api/folders', { method: 'POST', body: JSON.stringify(input) }),
  getAgentRunChecks: (runId: number): Promise<AgentCheck[]> =>
    send(`/api/agent-runs/${runId}/checks`),
  runAgentRunChecks: (
    runId: number,
    kinds?: Array<'typecheck' | 'tests' | 'lint' | 'e2e'>,
  ): Promise<AgentCheck[]> =>
    send(`/api/agent-runs/${runId}/checks/run`, {
      method: 'POST',
      body: JSON.stringify(kinds ? { kinds } : {}),
    }),
  getAgentRunPreview: (runId: number): Promise<PreviewStatePayload> =>
    send(`/api/agent-runs/${runId}/preview`),
  startAgentRunPreview: (runId: number): Promise<PreviewStatePayload> =>
    send(`/api/agent-runs/${runId}/preview/start`, { method: 'POST' }),
  stopAgentRunPreview: (runId: number): Promise<PreviewStatePayload> =>
    send(`/api/agent-runs/${runId}/preview/stop`, { method: 'POST' }),
  approveIssue: (issueNumber: number): Promise<Issue> =>
    send(`/api/issues/${issueNumber}/pr/approve`, { method: 'POST' }),
  requestChangesIssue: (issueNumber: number): Promise<Issue> =>
    send(`/api/issues/${issueNumber}/pr/request-changes`, { method: 'POST' }),
  archiveIssue: (issueNumber: number): Promise<Issue> =>
    send(`/api/issues/${issueNumber}/archive`, { method: 'POST' }),
  splitIssue: (
    issueNumber: number,
    subtasks: Array<{ title: string; body?: string }>,
    opts: { dispatch?: boolean } = {},
  ): Promise<{ parent: number; children: Issue[] }> =>
    send(`/api/issues/${issueNumber}/split`, {
      method: 'POST',
      body: JSON.stringify({ subtasks, dispatch: opts.dispatch ?? false }),
    }),
  spawnReviewer: (
    issueNumber: number,
    opts: { threadId?: number; prompt?: string; model?: string } = {},
  ): Promise<AgentRun> =>
    send(`/api/issues/${issueNumber}/reviewer`, {
      method: 'POST',
      body: JSON.stringify(opts),
    }),
  forkAgentRun: (
    runId: number,
  ): Promise<{ source: number; run: AgentRun; worktree: string; branch: string }> =>
    send(`/api/agent-runs/${runId}/fork`, { method: 'POST' }),
  costToday: (): Promise<{ totalUsd: number; since: string }> => send('/api/cost/today'),
  resolveCard: (cardId: number, value: string): Promise<ResolveCardResult> =>
    send(`/api/cards/${cardId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
};
