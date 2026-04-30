import { z } from 'zod';
import type { AgentRun, ChatConversation, Message } from '@kanbots/local-store';
import type { ChatPayload, ChatPostMessageResult } from '../bridge.js';
import { alreadyActive, parseArgs } from './errors.js';
import type { HandlerDeps } from './types.js';

const createSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
  })
  .strict();

const getSchema = z
  .object({
    conversationId: z.number().int().positive(),
  })
  .strict();

const renameSchema = z
  .object({
    conversationId: z.number().int().positive(),
    title: z.string().min(1).max(200),
  })
  .strict();

const deleteSchema = z
  .object({
    conversationId: z.number().int().positive(),
  })
  .strict();

const PROVIDER_ENUM = z.enum([
  'claude-code',
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'xai',
]);

const postMessageSchema = z
  .object({
    conversationId: z.number().int().positive(),
    body: z.string().min(1).max(65_536),
    dispatch: z.boolean().optional(),
    model: z.string().min(1).max(120).optional(),
    provider: PROVIDER_ENUM.optional(),
    appendSystemPrompt: z.string().max(20_000).optional(),
  })
  .strict();

const stopRunSchema = z
  .object({ runId: z.number().int().positive() })
  .strict();

const SYSTEM_PROMPT_DEFAULT = `KANBOTS_CHAT_CONTEXT — this conversation is a general-purpose chat with the kanbots agent. It is NOT scoped to any single issue.

You can use the kanban tools provided by the kanbots MCP server (createIssue, updateIssue, moveIssueStatus, archiveIssue, splitIssue, dispatchAgent, stopAgentRun, listIssues, getIssue, listAgentRuns, resolvePendingDecision) to act on the user's board, and the standard workspace tools (Bash, Read, Edit, Glob, Grep, Write) to inspect and edit code.

When the user asks about "the board", "open issues", "recent runs", or similar, prefer the kanban tools over reading the database directly.`;

function makeChatPayload(
  deps: HandlerDeps,
  conversation: ChatConversation,
): ChatPayload {
  const messages: Message[] = deps.store.messages.list(conversation.threadId);
  const activeRun = deps.store.agentRuns.findActiveForThread(conversation.threadId);
  const latestRun =
    activeRun ?? deps.store.agentRuns.findLatestForThread(conversation.threadId);
  return {
    conversation,
    messages,
    activeRun,
    latestRun,
  };
}

export async function list(deps: HandlerDeps): Promise<ChatConversation[]> {
  return deps.store.chatConversations.list();
}

export async function create(
  deps: HandlerDeps,
  args: { title?: string },
): Promise<ChatPayload> {
  const parsed = parseArgs(createSchema, args ?? {});
  const conversation = deps.store.chatConversations.create({
    title: parsed.title ?? 'New chat',
  });
  return makeChatPayload(deps, conversation);
}

export async function get(
  deps: HandlerDeps,
  args: { conversationId: number },
): Promise<ChatPayload> {
  const parsed = parseArgs(getSchema, args);
  const conversation = deps.store.chatConversations.findById(parsed.conversationId);
  if (!conversation) {
    throw new Error(`chat conversation ${parsed.conversationId} not found`);
  }
  return makeChatPayload(deps, conversation);
}

export async function rename(
  deps: HandlerDeps,
  args: { conversationId: number; title: string },
): Promise<ChatConversation> {
  const parsed = parseArgs(renameSchema, args);
  return deps.store.chatConversations.rename(parsed.conversationId, parsed.title);
}

export async function deleteConversation(
  deps: HandlerDeps,
  args: { conversationId: number },
): Promise<{ ok: true }> {
  const parsed = parseArgs(deleteSchema, args);
  const conversation = deps.store.chatConversations.findById(parsed.conversationId);
  if (!conversation) return { ok: true };
  // If a run is active on this conversation's thread, stop it first so we
  // don't leave an orphaned claude process behind.
  const active = deps.store.agentRuns.findActiveForThread(conversation.threadId);
  if (active !== null) {
    try {
      await deps.supervisor.stop(active.id);
    } catch {
      // best-effort
    }
  }
  deps.store.chatConversations.delete(parsed.conversationId);
  return { ok: true };
}

export async function postMessage(
  deps: HandlerDeps,
  args: {
    conversationId: number;
    body: string;
    dispatch?: boolean;
    model?: string;
    provider?:
      | 'claude-code'
      | 'anthropic'
      | 'openai'
      | 'google'
      | 'deepseek'
      | 'xai';
    appendSystemPrompt?: string;
  },
): Promise<ChatPostMessageResult> {
  const parsed = parseArgs(postMessageSchema, args);
  const conversation = deps.store.chatConversations.findById(parsed.conversationId);
  if (!conversation) {
    throw new Error(`chat conversation ${parsed.conversationId} not found`);
  }
  const dispatch = parsed.dispatch ?? true;

  const message = deps.store.messages.create({
    threadId: conversation.threadId,
    role: 'user',
    body: parsed.body,
  });
  deps.store.chatConversations.touch(conversation.id);

  let dispatchError: string | null = null;
  let activeRun: AgentRun | null = null;
  let latestRun: AgentRun | null = null;
  if (dispatch) {
    const active = deps.store.agentRuns.findActiveForThread(conversation.threadId);
    const latest = active ?? deps.store.agentRuns.findLatestForThread(conversation.threadId);
    const willResume =
      (active !== null && active.status === 'awaiting_input') ||
      (active === null && latest !== null && latest.sessionId !== null);
    const willStart = active === null && !willResume;
    if (active !== null && !willResume) {
      throw alreadyActive(`agent run #${active.id} is already ${active.status}`, active);
    }
    const appendSystemPrompt =
      parsed.appendSystemPrompt !== undefined
        ? `${SYSTEM_PROMPT_DEFAULT}\n\n${parsed.appendSystemPrompt}`
        : SYSTEM_PROMPT_DEFAULT;
    let toolPrep: Awaited<ReturnType<NonNullable<typeof deps.chatTools>['prepareForRun']>> | null = null;
    if (deps.chatTools) {
      try {
        toolPrep = await deps.chatTools.prepareForRun();
      } catch {
        toolPrep = null;
      }
    }
    try {
      if (willResume && latest !== null) {
        await deps.supervisor.resumeChat({
          runId: latest.id,
          prompt: parsed.body,
          appendSystemPrompt,
          ...(toolPrep ? { extraArgs: toolPrep.extraArgs, env: toolPrep.env } : {}),
        });
      } else if (willStart) {
        await deps.supervisor.startChat({
          threadId: conversation.threadId,
          prompt: parsed.body,
          ...(parsed.model !== undefined ? { model: parsed.model } : {}),
          ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
          appendSystemPrompt,
          ...(toolPrep ? { extraArgs: toolPrep.extraArgs, env: toolPrep.env } : {}),
        });
      }
    } catch (err) {
      dispatchError = err instanceof Error ? err.message : String(err);
      if (toolPrep) toolPrep.cleanup();
    }
  }

  activeRun = deps.store.agentRuns.findActiveForThread(conversation.threadId);
  latestRun = activeRun ?? deps.store.agentRuns.findLatestForThread(conversation.threadId);

  const updated = deps.store.chatConversations.findById(conversation.id) ?? conversation;
  return {
    conversation: updated,
    message,
    activeRun,
    latestRun,
    ...(dispatchError !== null ? { dispatchError } : {}),
  };
}

export async function stopRun(
  deps: HandlerDeps,
  args: { runId: number },
): Promise<AgentRun> {
  const parsed = parseArgs(stopRunSchema, args);
  return deps.supervisor.stop(parsed.runId);
}
