/**
 * Tool manifest shared between the kanbots tool-bridge (in the desktop main
 * process) and the MCP stdio server. The desktop bridge dispatches the
 * named tools through the same handler logic the IPC bridge uses; the MCP
 * server simply forwards each call as an HTTP POST to the bridge.
 */

export const PACKAGE_NAME = '@kanbots/mcp';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const KANBOTS_TOOLS: readonly ToolDef[] = [
  {
    name: 'listIssues',
    description:
      'List issues in the current kanbots workspace. Returns title, number, status, agent, labels, etc.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Issue state to filter by (default: open).',
        },
      },
    },
  },
  {
    name: 'getIssue',
    description: 'Fetch a single issue (with comments and thread) by number.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        number: { type: 'integer', minimum: 1 },
      },
      required: ['number'],
    },
  },
  {
    name: 'createIssue',
    description: 'Create a new issue. Returns the new issue number and details.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        body: { type: 'string', maxLength: 65536 },
        labels: { type: 'array', items: { type: 'string' } },
      },
      required: ['title'],
    },
  },
  {
    name: 'updateIssue',
    description:
      'Patch an existing issue (title, body, state, labels, assignees). For status changes, see moveIssueStatus.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        number: { type: 'integer', minimum: 1 },
        title: { type: 'string' },
        body: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed'] },
        labels: { type: 'array', items: { type: 'string' } },
      },
      required: ['number'],
    },
  },
  {
    name: 'moveIssueStatus',
    description:
      'Move an issue to a new kanban status (backlog, todo, inProgress, review, done). Updates the status:* label.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        number: { type: 'integer', minimum: 1 },
        status: {
          type: 'string',
          enum: ['backlog', 'todo', 'inProgress', 'review', 'done'],
        },
      },
      required: ['number', 'status'],
    },
  },
  {
    name: 'archiveIssue',
    description: 'Archive an issue (closes it and adds the archived label).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { number: { type: 'integer', minimum: 1 } },
      required: ['number'],
    },
  },
  {
    name: 'splitIssue',
    description:
      'Split an issue into one or more subtask issues. The parent stays open and the children are created with linkage labels.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        number: { type: 'integer', minimum: 1 },
        subtasks: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', minLength: 1 },
              body: { type: 'string' },
            },
            required: ['title'],
          },
        },
        dispatch: { type: 'boolean' },
      },
      required: ['number', 'subtasks'],
    },
  },
  {
    name: 'dispatchAgent',
    description:
      'Kick off a dedicated agent run on an issue (creates a worktree and starts a fresh claude run). Returns the agent run id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        number: { type: 'integer', minimum: 1 },
        fromStatus: {
          type: ['string', 'null'],
          enum: ['backlog', 'todo', 'inProgress', 'review', 'done', null],
        },
        model: { type: 'string' },
      },
      required: ['number'],
    },
  },
  {
    name: 'stopAgentRun',
    description: 'Stop a running agent run by id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { runId: { type: 'integer', minimum: 1 } },
      required: ['runId'],
    },
  },
  {
    name: 'listAgentRuns',
    description: 'List all agent runs for an issue.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { number: { type: 'integer', minimum: 1 } },
      required: ['number'],
    },
  },
  {
    name: 'resolvePendingDecision',
    description:
      'Resolve a pending decision card (the agent on a sibling run has asked for the user\'s input). Use listPendingDecisions to discover cardIds.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cardId: { type: 'integer', minimum: 1 },
        value: { type: 'string', minLength: 1 },
      },
      required: ['cardId', 'value'],
    },
  },
  {
    name: 'listPendingDecisions',
    description:
      'List every pending decision card across the workspace so the agent can resolve them on the user\'s behalf.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
];

export type ToolName = (typeof KANBOTS_TOOLS)[number]['name'];
