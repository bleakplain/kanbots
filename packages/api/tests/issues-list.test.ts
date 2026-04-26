import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { issueFixture } from './helpers/fixtures.js';
import { makeTestApp } from './helpers/make-app.js';

describe('GET /api/issues', () => {
  it('returns issues from the source', async () => {
    const { app, source } = makeTestApp();
    source.setIssues('open', [issueFixture(1, 'first'), issueFixture(2, 'second')]);
    const res = await request(app).get('/api/issues');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].number).toBe(1);
    expect(res.body[0].title).toBe('first');
    expect(res.body[1].title).toBe('second');
  });

  it('decorates issues with status and agent from labels', async () => {
    const { app, source } = makeTestApp();
    source.setIssues('open', [
      issueFixture(1, 'todo-with-running', { labels: ['status:in-progress', 'agent:running'] }),
      issueFixture(2, 'plain', { labels: [] }),
      issueFixture(3, 'review', { labels: ['status:review', 'agent:blocked'] }),
    ]);
    const res = await request(app).get('/api/issues');
    expect(res.body[0].status).toBe('inProgress');
    expect(res.body[0].agent).toBe('running');
    expect(res.body[1].status).toBeNull();
    expect(res.body[1].agent).toBeNull();
    expect(res.body[2].status).toBe('review');
    expect(res.body[2].agent).toBe('blocked');
  });

  it('passes state filter to the source', async () => {
    const { app, source } = makeTestApp();
    source.setIssues('closed', [issueFixture(1, 'closed-one')]);
    source.setIssues('open', [issueFixture(2, 'open-one')]);

    const closed = await request(app).get('/api/issues?state=closed');
    expect(closed.body).toHaveLength(1);
    expect(closed.body[0].title).toBe('closed-one');

    const open = await request(app).get('/api/issues?state=open');
    expect(open.body[0].title).toBe('open-one');
  });

  it('supports state=all', async () => {
    const { app, source } = makeTestApp();
    source.setIssues('all', [issueFixture(1, 'a'), issueFixture(2, 'b')]);
    const res = await request(app).get('/api/issues?state=all');
    expect(res.body).toHaveLength(2);
  });

  it('returns 400 on invalid state', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/issues?state=bogus');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns empty array when source has nothing', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/issues');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
