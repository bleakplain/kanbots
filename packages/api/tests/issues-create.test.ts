import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers/make-app.js';

describe('POST /api/issues', () => {
  it('creates an issue with title only and returns 201 + decorated issue', async () => {
    const { app } = makeTestApp();

    const res = await request(app).post('/api/issues').send({ title: 'Add dark mode' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Add dark mode');
    expect(res.body.state).toBe('open');
    expect(res.body.number).toBeTypeOf('number');
    expect(res.body.status).toBeNull();
    expect(res.body.agent).toBeNull();
    expect(res.body.htmlUrl).toMatch(/github\.com\/octo\/hello\/issues\/\d+/);
  });

  it('accepts body, labels, assignees', async () => {
    const { app } = makeTestApp();

    const res = await request(app)
      .post('/api/issues')
      .send({
        title: 'feature x',
        body: 'a body',
        labels: ['status:todo'],
        assignees: ['someone'],
      });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe('a body');
    expect(res.body.labels).toEqual(['status:todo']);
    expect(res.body.assignees).toEqual(['someone']);
    expect(res.body.status).toBe('todo');
  });

  it('appears in subsequent GET /api/issues', async () => {
    const { app } = makeTestApp();

    const created = await request(app).post('/api/issues').send({ title: 'a' });
    const list = await request(app).get('/api/issues');
    expect(list.status).toBe(200);
    expect(list.body.some((i: { number: number }) => i.number === created.body.number)).toBe(true);
  });

  it('rejects empty title', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues').send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('rejects missing title', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues').send({});
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues').send({ title: 't', mystery: 'x' });
    expect(res.status).toBe(400);
  });

  it('propagates upstream 403', async () => {
    const { app, source } = makeTestApp();
    source.failCreateIssue(403, 'no write access');
    const res = await request(app).post('/api/issues').send({ title: 't' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('UpstreamError');
  });
});
