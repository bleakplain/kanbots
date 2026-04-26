import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { issueFixture } from './helpers/fixtures.js';
import { makeTestApp } from './helpers/make-app.js';

describe('PATCH /api/issues/:n', () => {
  it('updates labels and returns the decorated issue', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky', { labels: ['status:todo'] }));

    const res = await request(app)
      .patch('/api/issues/7')
      .send({ labels: ['status:in-progress', 'agent:running'] });

    expect(res.status).toBe(200);
    expect(res.body.number).toBe(7);
    expect(res.body.labels).toEqual(['status:in-progress', 'agent:running']);
    expect(res.body.status).toBe('inProgress');
    expect(res.body.agent).toBe('running');
  });

  it('updates state', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    const res = await request(app).patch('/api/issues/7').send({ state: 'closed' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('closed');
  });

  it('updates title', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    const res = await request(app).patch('/api/issues/7').send({ title: 'renamed' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('renamed');
  });

  it('rejects unknown fields (strict)', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    const res = await request(app).patch('/api/issues/7').send({ bogus: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects bad state value', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    const res = await request(app).patch('/api/issues/7').send({ state: 'reopened' });
    expect(res.status).toBe(400);
  });

  it('rejects empty title', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    const res = await request(app).patch('/api/issues/7').send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-numeric path', async () => {
    const { app } = makeTestApp();
    const res = await request(app).patch('/api/issues/abc').send({ labels: [] });
    expect(res.status).toBe(400);
  });

  it('propagates upstream 404', async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .patch('/api/issues/9999')
      .send({ labels: ['x'] });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('UpstreamError');
  });

  it('propagates upstream 403', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    source.failUpdate(403, 'forbidden');
    const res = await request(app)
      .patch('/api/issues/7')
      .send({ labels: ['x'] });
    expect(res.status).toBe(403);
  });

  it('accepts an empty patch', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky', { labels: ['status:todo'] }));
    const res = await request(app).patch('/api/issues/7').send({});
    expect(res.status).toBe(200);
    expect(res.body.labels).toEqual(['status:todo']);
  });
});
