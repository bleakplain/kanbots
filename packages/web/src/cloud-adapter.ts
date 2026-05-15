import type { AgentRunStatus, CardStatus, CardSummary } from '@kanbots/cloud-client';
import type { AgentKey, Issue, IssueDetail, StatusKey } from './types.js';

/**
 * Cloud-only launch — phase 1 unification: when a cloud workspace is open
 * the renderer uses local-mode hooks/components fed by an adapter that maps
 * cloud `CardSummary` → `DecoratedIssue` (the type Board.tsx and the rest
 * of the renderer expect). This file owns those mappings in one place.
 *
 * Status mapping:
 *   cloud 'inbox'        ↔ local null (untagged)
 *   cloud 'backlog'      ↔ local 'backlog'
 *   cloud 'ready'        ↔ local 'todo'
 *   cloud 'in_progress'  ↔ local 'inProgress'
 *   cloud 'review'       ↔ local 'review'
 *   cloud 'done'         ↔ local 'done'
 *   cloud 'blocked'      → local null (until Board grows a blocked column)
 *   cloud 'archived'     → filtered out by callers, never rendered
 */
export function cloudStatusToLocal(status: CardStatus): StatusKey | null {
  switch (status) {
    case 'backlog':
      return 'backlog';
    case 'ready':
      return 'todo';
    case 'in_progress':
      return 'inProgress';
    case 'review':
      return 'review';
    case 'done':
      return 'done';
    case 'inbox':
    case 'blocked':
    case 'archived':
      return null;
  }
}

export function localStatusToCloud(status: StatusKey | null): CardStatus {
  if (status === null) return 'inbox';
  switch (status) {
    case 'backlog':
      return 'backlog';
    case 'todo':
      return 'ready';
    case 'inProgress':
      return 'in_progress';
    case 'review':
      return 'review';
    case 'done':
      return 'done';
  }
}

/**
 * Translates a local-mode label patch (used by drag-drop) into the cloud
 * status the API expects. The renderer encodes status as a `status:<key>`
 * label on each card; we look for that label here and map to CardStatus.
 */
export function statusFromLabels(labels: readonly string[]): CardStatus | null {
  for (const label of labels) {
    if (!label.startsWith('status:')) continue;
    const key = label.slice('status:'.length) as StatusKey;
    switch (key) {
      case 'backlog':
      case 'todo':
      case 'inProgress':
      case 'review':
      case 'done':
        return localStatusToCloud(key);
    }
  }
  return null;
}

const PLACEHOLDER_USER = { login: 'cloud', avatarUrl: null } as const;

/**
 * Maps cloud agent-run status → local renderer's AgentKey union. Only
 * terminal succeeded runs map to `null` (no badge); failed/cancelled
 * surface as 'failed' so the user knows the last attempt didn't land.
 */
export function agentFromRunStatus(status: AgentRunStatus): AgentKey | null {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'running':
      return 'running';
    case 'awaiting_input':
      return 'blocked';
    case 'failed':
    case 'timed_out':
      return 'failed';
    case 'succeeded':
    case 'stopped':
      return null;
  }
}

export function cardToIssue(card: CardSummary): Issue {
  const status = cloudStatusToLocal(card.status);
  const labels: string[] = [];
  if (status !== null) labels.push(`status:${status}`);
  const agent = card.latest_run !== null ? agentFromRunStatus(card.latest_run.status) : null;
  if (agent !== null) labels.push(`agent:${agent}`);
  return {
    number: card.number,
    title: card.title,
    body: card.body ?? '',
    state: card.archived_at !== null ? 'closed' : 'open',
    labels,
    assignees: [],
    user: PLACEHOLDER_USER,
    createdAt: card.created_at,
    updatedAt: card.updated_at,
    closedAt: card.archived_at,
    htmlUrl: '',
    isPullRequest: false,
    status,
    agent,
    // DecoratedIssue.activeRun requires a numeric id; cloud runs are
    // ULIDs. Until the renderer widens that type (separate refactor),
    // we surface agent state via `agent` only and leave activeRun null.
    activeRun: null,
    sentryMeta: null,
  };
}

export function cardsToIssues(cards: readonly CardSummary[]): Issue[] {
  return cards.filter((c) => c.archived_at === null).map(cardToIssue);
}

/**
 * Synthetic IssueDetail constructed from a CardSummary. Comments and the
 * agent thread are stubbed empty — wiring those through `cloudCommentsList`
 * and `cloudRunsListForCard` is part of phase 2/4.
 */
export function cardToIssueDetail(card: CardSummary): IssueDetail {
  return {
    issue: cardToIssue(card),
    comments: [],
    thread: null,
  };
}
