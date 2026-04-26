import { Router } from 'express';
import { z } from 'zod';
import type { AgentEvent, AgentRunStatus, Card } from '@kanbots/local-store';
import type { AgentSupervisor } from '../agent-runs/supervisor.js';

export interface AgentRoutesDeps {
  supervisor: AgentSupervisor;
}

const issueNumberSchema = z.coerce.number().int().positive();
const runIdSchema = z.coerce.number().int().positive();
const sinceSeqSchema = z.coerce.number().int().min(-1).optional();

const startAgentSchema = z
  .object({
    threadId: z.number().int().positive(),
    prompt: z.string().min(1).max(20_000),
    appendSystemPrompt: z.string().max(20_000).optional(),
    model: z.string().min(1).max(120).optional(),
  })
  .strict();

export function agentRunsRouter(deps: AgentRoutesDeps): Router {
  const router = Router();

  router.post('/issues/:n/agent/start', async (req, res) => {
    const n = issueNumberSchema.parse(req.params.n);
    const parsed = startAgentSchema.parse(req.body);
    const run = await deps.supervisor.start({
      threadId: parsed.threadId,
      issueNumber: n,
      prompt: parsed.prompt,
      ...(parsed.appendSystemPrompt !== undefined
        ? { appendSystemPrompt: parsed.appendSystemPrompt }
        : {}),
      ...(parsed.model !== undefined ? { model: parsed.model } : {}),
    });
    res.status(201).json(run);
  });

  router.post('/agent-runs/:id/stop', async (req, res) => {
    const id = runIdSchema.parse(req.params.id);
    const run = await deps.supervisor.stop(id);
    res.json(run);
  });

  router.get('/agent-runs/:id', async (req, res) => {
    const id = runIdSchema.parse(req.params.id);
    const run = deps.supervisor.getRun(id);
    if (!run) {
      res.status(404).json({ error: 'NotFound' });
      return;
    }
    res.json(run);
  });

  router.get('/agent-runs/:id/events', async (req, res) => {
    const id = runIdSchema.parse(req.params.id);
    const sinceSeq = sinceSeqSchema.parse(req.query.since);

    const run = deps.supervisor.getRun(id);
    if (!run) {
      res.status(404).json({ error: 'NotFound' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let highestSeq = sinceSeq ?? -1;
    const seenCardIds = new Set<number>();

    function sendAgentEvent(ev: AgentEvent): void {
      if (ev.seq <= highestSeq) return;
      highestSeq = ev.seq;
      res.write(`event: agent\ndata: ${JSON.stringify(ev)}\n\n`);
    }

    function sendCard(card: Card): void {
      if (seenCardIds.has(card.id)) return;
      seenCardIds.add(card.id);
      res.write(`event: card\ndata: ${JSON.stringify(card)}\n\n`);
    }

    function sendStatus(status: AgentRunStatus): void {
      res.write(`event: status\ndata: ${JSON.stringify({ runId: id, status })}\n\n`);
    }

    let unsub: (() => void) | null = null;
    if (deps.supervisor.isActive(id)) {
      unsub = deps.supervisor.subscribe(
        id,
        sendAgentEvent,
        (status) => {
          sendStatus(status);
          if (status !== 'awaiting_input') res.end();
        },
        sendCard,
      );
    }

    const historical = deps.supervisor.listEvents(id, highestSeq);
    for (const ev of historical) sendAgentEvent(ev);
    const historicalCards = deps.supervisor.listCards(id);
    for (const c of historicalCards) sendCard(c);

    if (!deps.supervisor.isActive(id)) {
      sendStatus(run.status);
      res.end();
      return;
    }

    const heartbeat = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      if (unsub) unsub();
    });
  });

  return router;
}
