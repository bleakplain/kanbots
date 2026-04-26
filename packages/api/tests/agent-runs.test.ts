import type { Store } from '@kanbots/local-store';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { issueFixture } from './helpers/fixtures.js';
import { makeTestApp } from './helpers/make-app.js';

async function ensureThread(store: Store, issueNumber: number): Promise<number> {
  const thread = store.threads.create({
    repoOwner: 'octo',
    repoName: 'hello',
    issueNumber,
  });
  return thread.id;
}

describe('POST /api/issues/:n/agent/start', () => {
  it('starts a run via the supervisor and returns 201 + run', async () => {
    const { app, store, supervisor, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    const threadId = await ensureThread(store, 7);

    const res = await request(app)
      .post('/api/issues/7/agent/start')
      .send({ threadId, prompt: 'do the thing' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf('number');
    expect(res.body.threadId).toBe(threadId);
    expect(res.body.status).toBe('running');
    expect(supervisor.calls).toHaveLength(1);
    expect(supervisor.calls[0]!.type).toBe('start');
  });

  it('rejects empty prompt', async () => {
    const { app, store } = makeTestApp();
    const threadId = await ensureThread(store, 7);
    const res = await request(app).post('/api/issues/7/agent/start').send({ threadId, prompt: '' });
    expect(res.status).toBe(400);
  });

  it('rejects missing threadId', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues/7/agent/start').send({ prompt: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/agent-runs/:id/stop', () => {
  it('stops a running run and returns the updated run', async () => {
    const { app, store, supervisor } = makeTestApp();
    const threadId = await ensureThread(store, 7);
    const start = await request(app)
      .post('/api/issues/7/agent/start')
      .send({ threadId, prompt: 'p' });

    const stop = await request(app).post(`/api/agent-runs/${start.body.id}/stop`).send();
    expect(stop.status).toBe(200);
    expect(stop.body.status).toBe('stopped');
    expect(supervisor.calls.map((c) => c.type)).toEqual(['start', 'stop']);
  });
});

describe('GET /api/agent-runs/:id', () => {
  it('returns the run', async () => {
    const { app, store } = makeTestApp();
    const threadId = await ensureThread(store, 7);
    const start = await request(app)
      .post('/api/issues/7/agent/start')
      .send({ threadId, prompt: 'p' });

    const res = await request(app).get(`/api/agent-runs/${start.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(start.body.id);
  });

  it('returns 404 for unknown run id', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/agent-runs/9999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/agent-runs/:id/events (SSE)', () => {
  it('streams historical events then live events, then ends on status', async () => {
    const { app, store, supervisor } = makeTestApp();
    const threadId = await ensureThread(store, 7);
    const start = await request(app)
      .post('/api/issues/7/agent/start')
      .send({ threadId, prompt: 'p' });
    const runId: number = start.body.id;

    // Pre-existing event in DB before any subscriber
    const e1 = store.events.append({
      agentRunId: runId,
      type: 'text',
      payload: { text: 'first' },
    });

    const reqPromise = new Promise<{ body: string; status: number }>((resolve, reject) => {
      const r = request(app)
        .get(`/api/agent-runs/${runId}/events`)
        .buffer(true)
        .parse((res, callback) => {
          let body = '';
          res.on('data', (c: Buffer) => {
            body += c.toString('utf8');
          });
          res.on('end', () => callback(null, body));
        });
      r.then((res) => resolve({ body: res.body as string, status: res.status }), reject);
    });

    // Push a live event then finish the run after a short delay
    setTimeout(() => {
      const live = store.events.append({
        agentRunId: runId,
        type: 'tool_use',
        payload: { toolUseId: 't1', name: 'Read', input: {} },
      });
      supervisor.pushEvent(runId, live);
      supervisor.finish(runId, 'complete');
    }, 30);

    const result = await reqPromise;
    expect(result.status).toBe(200);
    expect(result.body).toContain(`"seq":${e1.seq}`);
    expect(result.body).toContain('"type":"tool_use"');
    expect(result.body).toContain('event: status');
    expect(result.body).toContain('"status":"complete"');
  });

  it('returns 404 for missing run', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/agent-runs/9999/events');
    expect(res.status).toBe(404);
  });

  it('flushes status immediately for already-complete runs', async () => {
    const { app, store } = makeTestApp();
    const threadId = await ensureThread(store, 7);
    const run = store.agentRuns.create({ threadId, status: 'starting' });
    store.agentRuns.update(run.id, {
      status: 'complete',
      endedAt: new Date().toISOString(),
    });

    const res = await request(app)
      .get(`/api/agent-runs/${run.id}/events`)
      .buffer(true)
      .parse((r, cb) => {
        let body = '';
        r.on('data', (c: Buffer) => {
          body += c.toString('utf8');
        });
        r.on('end', () => cb(null, body));
      });
    expect(res.status).toBe(200);
    expect(res.body as string).toContain('"status":"complete"');
  });
});
