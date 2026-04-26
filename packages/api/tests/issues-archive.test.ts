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

describe('POST /api/issues/:n/archive', () => {
  it('stops the active agent run, closes the issue, and adds the archived label', async () => {
    const { app, store, source, supervisor } = makeTestApp();
    source.setIssue(
      issueFixture(7, 'lucky', { labels: ['status:in-progress', 'agent:running', 'area:auth'] }),
    );
    const threadId = await ensureThread(store, 7);
    const start = await request(app)
      .post('/api/issues/7/agent/start')
      .send({ threadId, prompt: 'p' });

    const res = await request(app).post('/api/issues/7/archive').send();

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('closed');
    expect(res.body.labels).toContain('archived');
    expect(res.body.labels).not.toContain('status:in-progress');
    expect(res.body.labels).not.toContain('agent:running');
    expect(res.body.labels).toContain('area:auth');
    expect(supervisor.calls.map((c) => c.type)).toContain('stop');
    expect(store.agentRuns.findById(start.body.id)?.status).toBe('stopped');
  });

  it('archives an issue with no thread or active run', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(8, 'no thread'));

    const res = await request(app).post('/api/issues/8/archive').send();

    expect(res.status).toBe(200);
    expect(res.body.labels).toContain('archived');
    expect(res.body.state).toBe('closed');
  });

  it('is idempotent on an already-archived issue', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(9, 'already', { labels: ['archived'], state: 'closed' }));

    const res = await request(app).post('/api/issues/9/archive').send();

    expect(res.status).toBe(200);
    expect(res.body.labels.filter((l: string) => l === 'archived')).toHaveLength(1);
  });
});
