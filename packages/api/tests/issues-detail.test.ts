import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { commentFixture, issueFixture } from './helpers/fixtures.js';
import { makeTestApp } from './helpers/make-app.js';

describe('GET /api/issues/:n', () => {
  it('returns issue + comments + null thread when no thread exists', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky', { labels: ['status:todo'] }));
    source.setComments(7, [commentFixture(101, 'first comment')]);

    const res = await request(app).get('/api/issues/7');
    expect(res.status).toBe(200);
    expect(res.body.issue.number).toBe(7);
    expect(res.body.issue.title).toBe('lucky');
    expect(res.body.issue.status).toBe('todo');
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].body).toBe('first comment');
    expect(res.body.thread).toBeNull();
  });

  it('includes thread payload when one exists', async () => {
    const { app, source, store } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    source.setComments(7, []);

    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });
    store.messages.create({ threadId: t.id, role: 'user', body: 'kick off' });
    store.messages.create({ threadId: t.id, role: 'agent', body: 'on it' });

    const res = await request(app).get('/api/issues/7');
    expect(res.body.thread).not.toBeNull();
    expect(res.body.thread.id).toBe(t.id);
    expect(res.body.thread.messages).toHaveLength(2);
    expect(res.body.thread.messages[0].body).toBe('kick off');
    expect(res.body.thread.messages[1].role).toBe('agent');
    expect(res.body.thread.activeRun).toBeNull();
  });

  it('surfaces an active agent run when present', async () => {
    const { app, source, store } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    source.setComments(7, []);

    const t = store.threads.create({ repoOwner: 'octo', repoName: 'hello', issueNumber: 7 });
    const run = store.agentRuns.create({ threadId: t.id });
    store.agentRuns.update(run.id, { status: 'running' });

    const res = await request(app).get('/api/issues/7');
    expect(res.body.thread.activeRun.id).toBe(run.id);
    expect(res.body.thread.activeRun.status).toBe('running');
  });

  it('thread is per-(owner, repo, issue) — does not leak across repos', async () => {
    const { app, source, store } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    source.setComments(7, []);

    // A thread for a *different* repo at the same issue number must NOT show up.
    const otherT = store.threads.create({
      repoOwner: 'someone',
      repoName: 'else',
      issueNumber: 7,
    });
    store.messages.create({ threadId: otherT.id, role: 'user', body: 'should not surface' });

    const res = await request(app).get('/api/issues/7');
    expect(res.body.thread).toBeNull();
  });

  it('returns upstream 404 when issue does not exist', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/issues/9999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('UpstreamError');
  });

  it('returns 400 on non-numeric issue number', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/issues/abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 on zero or negative issue number', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/issues/0');
    expect(res.status).toBe(400);
  });
});
