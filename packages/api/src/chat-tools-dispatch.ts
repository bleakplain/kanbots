import { withStatusLabel } from '@kanbots/core';
import type { Handlers } from './handlers/index.js';
import type { ToolDispatcher } from './tool-bridge.js';

/**
 * Maps each MCP-exposed kanban tool to the typed IPC handler that performs
 * the work. This keeps the chat agent's tool surface aligned with the
 * board UI's surface — every tool call is shaped exactly like the request
 * a renderer would have made over IPC.
 */
export const dispatchChatTool: ToolDispatcher = async (name, rawArgs, handlers) => {
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<
    string,
    unknown
  >;

  switch (name) {
    case 'listIssues': {
      const state = (args.state as 'open' | 'closed' | 'all' | undefined) ?? 'open';
      return handlers['issues:list']({ state });
    }
    case 'getIssue': {
      const number = expectNumber(args, 'number');
      return handlers['issues:get']({ number });
    }
    case 'createIssue': {
      const title = expectString(args, 'title');
      const out: Parameters<Handlers['issues:create']>[0] = { title };
      if (typeof args.body === 'string') out.body = args.body;
      if (Array.isArray(args.labels)) {
        out.labels = (args.labels as unknown[]).filter(
          (v): v is string => typeof v === 'string',
        );
      }
      return handlers['issues:create'](out);
    }
    case 'updateIssue': {
      const number = expectNumber(args, 'number');
      const patch: Parameters<Handlers['issues:patch']>[0]['patch'] = {};
      if (typeof args.title === 'string') patch.title = args.title;
      if (typeof args.body === 'string') patch.body = args.body;
      if (args.state === 'open' || args.state === 'closed') patch.state = args.state;
      if (Array.isArray(args.labels)) {
        patch.labels = (args.labels as unknown[]).filter(
          (v): v is string => typeof v === 'string',
        );
      }
      return handlers['issues:patch']({ number, patch });
    }
    case 'moveIssueStatus': {
      const number = expectNumber(args, 'number');
      const status = expectString(args, 'status') as
        | 'backlog'
        | 'todo'
        | 'inProgress'
        | 'review'
        | 'done';
      const detail = await handlers['issues:get']({ number });
      const patchedLabels = withStatusLabel(detail.issue.labels, status);
      return handlers['issues:patch']({
        number,
        patch: { labels: patchedLabels },
      });
    }
    case 'archiveIssue': {
      const number = expectNumber(args, 'number');
      return handlers['issues:archive']({ number });
    }
    case 'splitIssue': {
      const number = expectNumber(args, 'number');
      if (!Array.isArray(args.subtasks) || args.subtasks.length === 0) {
        throw new Error('splitIssue: subtasks must be a non-empty array');
      }
      const subtasks = (args.subtasks as Array<Record<string, unknown>>).map((s) => {
        const out: { title: string; body?: string } = {
          title: expectString(s, 'title'),
        };
        if (typeof s.body === 'string') out.body = s.body;
        return out;
      });
      const split: Parameters<Handlers['issues:split']>[0] = {
        number,
        subtasks,
      };
      if (typeof args.dispatch === 'boolean') split.dispatch = args.dispatch;
      return handlers['issues:split'](split);
    }
    case 'dispatchAgent': {
      const number = expectNumber(args, 'number');
      const fromStatus =
        args.fromStatus === undefined || args.fromStatus === null
          ? null
          : (expectString(args, 'fromStatus') as
              | 'backlog'
              | 'todo'
              | 'inProgress'
              | 'review'
              | 'done');
      const dispatchInput: Parameters<Handlers['issues:dispatch']>[0] = {
        number,
        fromStatus,
      };
      if (typeof args.model === 'string') dispatchInput.model = args.model;
      return handlers['issues:dispatch'](dispatchInput);
    }
    case 'stopAgentRun': {
      const runId = expectNumber(args, 'runId');
      return handlers['agent-runs:stop']({ runId });
    }
    case 'listAgentRuns': {
      const number = expectNumber(args, 'number');
      return handlers['issues:list-runs']({ number });
    }
    case 'resolvePendingDecision': {
      const cardId = expectNumber(args, 'cardId');
      const value = expectString(args, 'value');
      return handlers['cards:resolve']({ cardId, value });
    }
    case 'listPendingDecisions': {
      return handlers['decisions:pending']();
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
};

function expectNumber(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`missing or invalid '${key}' (expected number)`);
  }
  return v;
}

function expectString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`missing or invalid '${key}' (expected string)`);
  }
  return v;
}
