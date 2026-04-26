import type { Store } from '@kanbots/local-store';
import { Router } from 'express';
import { z } from 'zod';
import type { AgentSupervisor } from '../agent-runs/supervisor.js';

export interface CardsRoutesDeps {
  store: Store;
  supervisor: AgentSupervisor;
}

const cardIdSchema = z.coerce.number().int().positive();
const resolveSchema = z
  .object({
    value: z.string().min(1).max(2000),
  })
  .strict();

export function cardsRouter(deps: CardsRoutesDeps): Router {
  const router = Router();

  router.post('/cards/:id/resolve', async (req, res) => {
    const id = cardIdSchema.parse(req.params.id);
    const { value } = resolveSchema.parse(req.body);

    const card = deps.store.cards.findById(id);
    if (!card) {
      res.status(404).json({ error: 'NotFound' });
      return;
    }
    if (card.type !== 'decision') {
      res.status(400).json({ error: 'BadRequest', message: 'card type not resolvable here' });
      return;
    }
    const payload = card.payload as
      | { question?: string; options?: Array<{ value: string; label: string }> }
      | undefined;
    const options = payload?.options ?? [];
    const chosen = options.find((o) => o.value === value);
    if (!chosen) {
      res.status(400).json({ error: 'BadRequest', message: `value not in options` });
      return;
    }

    const message = deps.store.messages.findById(card.messageId);
    if (!message || message.agentRunId === null) {
      res.status(500).json({ error: 'InternalError', message: 'card not linked to an agent run' });
      return;
    }
    const runId = message.agentRunId;

    const resolved = deps.store.cards.resolve(card.id, { value, label: chosen.label });

    const resumePrompt = `User chose: ${chosen.label} (value: ${value}). Continue.`;
    let nextRun;
    try {
      nextRun = await deps.supervisor.resume({ runId, prompt: resumePrompt });
    } catch (err) {
      res.status(500).json({
        error: 'InternalError',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    res.json({ card: resolved, run: nextRun });
  });

  router.get('/agent-runs/:id/cards', async (req, res) => {
    const id = cardIdSchema.parse(req.params.id);
    const cards = deps.supervisor.listCards(id);
    res.json(cards);
  });

  return router;
}
