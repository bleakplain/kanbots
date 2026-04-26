import {
  defaultCheckCommand,
  runCheck,
  type CheckCommand,
  type CheckResult,
} from '@kanbots/dispatcher';
import type { CheckKind, Store } from '@kanbots/local-store';
import { Router } from 'express';
import { z } from 'zod';

const idSchema = z.coerce.number().int().positive();
const kindSchema = z.enum(['typecheck', 'tests', 'lint', 'e2e']);
const runSchema = z
  .object({
    kinds: z.array(kindSchema).optional(),
  })
  .strict();

export interface AgentChecksDeps {
  store: Store;
  runCheckImpl?: (
    options: { cwd: string; command: CheckCommand },
  ) => Promise<CheckResult>;
}

const inFlight = new Map<number, Set<CheckKind>>();

export function agentChecksRouter(deps: AgentChecksDeps): Router {
  const router = Router();
  const runImpl =
    deps.runCheckImpl ??
    ((opts: { cwd: string; command: CheckCommand }) =>
      runCheck({ cwd: opts.cwd, command: opts.command }));

  router.get('/agent-runs/:id/checks', (req, res) => {
    const id = idSchema.parse(req.params.id);
    const checks = deps.store.checks.listLatestByRun(id);
    res.json(checks);
  });

  router.post('/agent-runs/:id/checks/run', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const parsed = runSchema.parse(req.body ?? {});
    const run = deps.store.agentRuns.findById(id);
    if (!run) {
      res.status(404).json({ error: 'NotFound' });
      return;
    }
    if (!run.worktreePath) {
      res.status(400).json({ error: 'BadRequest', message: 'run has no worktree' });
      return;
    }
    const kinds: CheckKind[] = parsed.kinds ?? ['typecheck', 'tests', 'lint'];
    const queued = inFlight.get(id) ?? new Set<CheckKind>();
    inFlight.set(id, queued);

    // Kick off all requested kinds in parallel; respond immediately with the
    // freshly-started rows so the client can render `running` pills, and let
    // each finish update the row asynchronously.
    const started = kinds
      .filter((kind) => !queued.has(kind))
      .map((kind) => deps.store.checks.start({ agentRunId: id, kind }));
    for (const kind of kinds) queued.add(kind);

    for (const checkRow of started) {
      const command = defaultCheckCommand(checkRow.kind);
      void runImpl({ cwd: run.worktreePath, command })
        .then((result) => {
          deps.store.checks.finish({
            id: checkRow.id,
            status: result.status,
            summary: result.summary,
          });
        })
        .catch((err: unknown) => {
          deps.store.checks.finish({
            id: checkRow.id,
            status: 'fail',
            summary: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          queued.delete(checkRow.kind);
        });
    }

    res.status(202).json(started);
  });

  return router;
}
