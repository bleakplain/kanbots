export const PACKAGE_NAME = '@kanbots/core';

export { GitHubClient, type GitHubClientOptions } from './github-client.js';
export { resolveGitHubToken, TOKEN_FILE_PATH, type AuthDeps } from './auth.js';
export type { IssueSource } from './issue-source.js';
export { GitHubRequestError, KanbotsAuthError, KanbotsError } from './errors.js';
export {
  AGENT_LABELS,
  AGENT_PREFIX,
  ALL_KANBOTS_LABELS,
  STATUS_LABELS,
  STATUS_PREFIX,
  agentFromLabels,
  statusFromLabels,
  withAgentLabel,
  withStatusLabel,
  type AgentKey,
  type StatusKey,
} from './labels.js';
export type { CacheEntry, ETagCache, SetCacheInput } from './etag-cache.js';
export type {
  Comment,
  CreateIssueInput,
  Issue,
  IssueState,
  Label,
  OpenPRInput,
  PullRequest,
  Repo,
  UpdateIssuePatch,
  User,
} from './types.js';
