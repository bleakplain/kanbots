import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { issueFixture } from './helpers/fixtures.js';
import { makeTestApp } from './helpers/make-app.js';

describe('POST /api/issues/:n/comments', () => {
  it('creates a comment and returns 201', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(1, 'a'));
    const res = await request(app).post('/api/issues/1/comments').send({ body: 'hello world' });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe('hello world');
    expect(res.body.id).toBeTypeOf('number');
    expect(res.body.user.login).toBe('tester');
  });

  it('rejects empty body', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues/1/comments').send({ body: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('rejects missing body', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues/1/comments').send({});
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues/1/comments').send({ body: 'hi', extra: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric path', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues/abc/comments').send({ body: 'hi' });
    expect(res.status).toBe(400);
  });

  it('propagates upstream 403', async () => {
    const { app, source } = makeTestApp();
    source.failAddComment(403, 'no write access');
    const res = await request(app).post('/api/issues/1/comments').send({ body: 'x' });
    expect(res.status).toBe(403);
  });

  it('appends to the comments visible on issue detail', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(1, 'a'));

    await request(app).post('/api/issues/1/comments').send({ body: 'first' });
    await request(app).post('/api/issues/1/comments').send({ body: 'second' });

    const res = await request(app).get('/api/issues/1');
    expect(res.body.comments).toHaveLength(2);
    expect(res.body.comments[0].body).toBe('first');
    expect(res.body.comments[1].body).toBe('second');
  });
});
