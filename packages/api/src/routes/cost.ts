import type { Store } from '@kanbots/local-store';
import { Router } from 'express';

export interface CostDeps {
  store: Store;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function costRouter(deps: CostDeps): Router {
  const router = Router();

  router.get('/cost/today', (_req, res) => {
    const total = deps.store.agentRuns.sumCostSince(startOfTodayIso());
    res.json({ totalUsd: total, since: startOfTodayIso() });
  });

  return router;
}
