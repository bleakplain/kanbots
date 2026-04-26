import type { Store } from '@kanbots/local-store';
import { Router } from 'express';
import type { ConfigPayload } from './config.js';

export interface DecisionsDeps {
  store: Store;
  config: ConfigPayload;
}

export interface PendingDecisionPayload {
  cardId: number;
  runId: number;
  issueNumber: number;
  question: string;
  options: Array<{ value: string; label: string }>;
  createdAt: string;
}

export function decisionsRouter(deps: DecisionsDeps): Router {
  const router = Router();

  router.get('/decisions/pending', async (_req, res) => {
    const rows = deps.store.cards.listPendingForRepo(deps.config.owner, deps.config.repo);
    const out: PendingDecisionPayload[] = [];
    for (const { card, agentRunId, issueNumber } of rows) {
      const payload = card.payload as
        | { question?: string; options?: Array<{ value?: string; label?: string }> }
        | undefined;
      if (!payload || typeof payload.question !== 'string' || !Array.isArray(payload.options))
        continue;
      const options = payload.options
        .filter((o): o is { value: string; label: string } =>
          typeof o?.value === 'string' && typeof o?.label === 'string',
        )
        .map((o) => ({ value: o.value, label: o.label }));
      if (options.length === 0) continue;
      // Approximate createdAt from resolvedAt fallback (always null for pending) — use a synthetic
      // created timestamp from the row id. The card row itself doesn't store created_at; the
      // message it belongs to does, but for the tray a stable monotonic ordering is enough.
      out.push({
        cardId: card.id,
        runId: agentRunId,
        issueNumber,
        question: payload.question,
        options,
        createdAt: card.resolvedAt ?? new Date().toISOString(),
      });
    }
    res.json(out);
  });

  return router;
}
