import { startPreview, type PreviewHandle } from '@kanbots/dispatcher';
import type { Store } from '@kanbots/local-store';
import { Router } from 'express';
import { z } from 'zod';

const idSchema = z.coerce.number().int().positive();

export interface AgentPreviewDeps {
  store: Store;
  startPreviewImpl?: (opts: { cwd: string }) => Promise<PreviewHandle>;
}

const handles = new Map<number, PreviewHandle>();

export function agentPreviewRouter(deps: AgentPreviewDeps): Router {
  const router = Router();
  const startImpl = deps.startPreviewImpl ?? ((opts: { cwd: string }) => startPreview(opts));

  router.get('/agent-runs/:id/preview', (req, res) => {
    const id = idSchema.parse(req.params.id);
    const run = deps.store.agentRuns.findById(id);
    if (!run) {
      res.status(404).json({ error: 'NotFound' });
      return;
    }
    res.json({
      url: run.previewUrl,
      state: run.previewState ?? 'idle',
      pid: run.previewPid,
    });
  });

  router.post('/agent-runs/:id/preview/start', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const run = deps.store.agentRuns.findById(id);
    if (!run) {
      res.status(404).json({ error: 'NotFound' });
      return;
    }
    if (!run.worktreePath) {
      res.status(400).json({ error: 'BadRequest', message: 'run has no worktree' });
      return;
    }
    if (handles.has(id)) {
      const existing = handles.get(id)!;
      res.json({ url: existing.url, state: existing.state, pid: existing.pid });
      return;
    }
    deps.store.agentRuns.update(id, { previewState: 'booting' });
    try {
      const handle = await startImpl({ cwd: run.worktreePath });
      handles.set(id, handle);
      deps.store.agentRuns.update(id, {
        previewUrl: handle.url,
        previewState: handle.state,
        previewPid: handle.pid,
      });
      res.status(201).json({ url: handle.url, state: handle.state, pid: handle.pid });
    } catch (err) {
      deps.store.agentRuns.update(id, {
        previewState: 'crashed',
        previewUrl: null,
        previewPid: null,
      });
      res.status(500).json({
        error: 'PreviewFailed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post('/agent-runs/:id/preview/stop', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const handle = handles.get(id);
    if (handle) await handle.stop();
    handles.delete(id);
    deps.store.agentRuns.update(id, { previewState: 'stopped', previewPid: null });
    res.json({ url: null, state: 'stopped', pid: null });
  });

  return router;
}
