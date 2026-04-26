import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { agentChecksRouter } from '../src/routes/agent-checks.js';
import express from 'express';
import { openStoreInMemory, type Store } from '@kanbots/local-store';

function withRouter(store: Store, runImpl: Parameters<typeof agentChecksRouter>[0]['runCheckImpl']) {
  const app = express();
  app.use(express.json());
  app.use('/api', agentChecksRouter({ store, runCheckImpl: runImpl ?? (async () => ({ kind: 'typecheck', status: 'pass', durationMs: 1, summary: 'ok' })) }));
  return app;
}

describe('GET /api/agent-runs/:id/checks', () => {
  it('returns [] for a run with no checks', async () => {
    const store = openStoreInMemory();
    const thread = store.threads.create({ repoOwner: 'o', repoName: 'r', issueNumber: 1 });
    const run = store.agentRuns.create({ threadId: thread.id, status: 'running' });
    const app = withRouter(store, undefined);
    const res = await request(app).get(`/api/agent-runs/${run.id}/checks`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    store.close();
  });
});

describe('POST /api/agent-runs/:id/checks/run', () => {
  it('404s for a missing run', async () => {
    const store = openStoreInMemory();
    const app = withRouter(store, undefined);
    const res = await request(app).post('/api/agent-runs/9999/checks/run').send({});
    expect(res.status).toBe(404);
    store.close();
  });

  it('400s when run has no worktree', async () => {
    const store = openStoreInMemory();
    const thread = store.threads.create({ repoOwner: 'o', repoName: 'r', issueNumber: 1 });
    const run = store.agentRuns.create({ threadId: thread.id, status: 'running' });
    const app = withRouter(store, undefined);
    const res = await request(app).post(`/api/agent-runs/${run.id}/checks/run`).send({});
    expect(res.status).toBe(400);
    store.close();
  });

  it('starts checks and returns the row stubs (status 202)', async () => {
    const store = openStoreInMemory();
    const thread = store.threads.create({ repoOwner: 'o', repoName: 'r', issueNumber: 1 });
    const run = store.agentRuns.create({
      threadId: thread.id,
      status: 'running',
      worktreePath: '/tmp/some-worktree',
    });
    type Resolver = (value: unknown) => void;
    let resolveRunner: Resolver | null = null;
    const app = withRouter(store, async () => {
      // Pause until the test releases, so we can assert the row appears as 'running'
      await new Promise<void>((r) => {
        resolveRunner = r as unknown as Resolver;
      });
      return { kind: 'typecheck', status: 'pass', durationMs: 5, summary: 'ok' };
    });
    const res = await request(app)
      .post(`/api/agent-runs/${run.id}/checks/run`)
      .send({ kinds: ['typecheck'] });
    expect(res.status).toBe(202);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].kind).toBe('typecheck');
    expect(res.body[0].status).toBe('running');

    const inflight = store.checks.listLatestByRun(run.id);
    expect(inflight).toHaveLength(1);
    expect(inflight[0]?.status).toBe('running');

    // Release the runner and let the async finish run
    if (resolveRunner) (resolveRunner as Resolver)(undefined);
    // Drain pending microtasks
    await new Promise((r) => setTimeout(r, 20));

    const final = store.checks.listLatestByRun(run.id);
    expect(final[0]?.status).toBe('pass');
    expect(final[0]?.summary).toBe('ok');
    store.close();
  });
});
