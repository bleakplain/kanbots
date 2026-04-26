import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { issueFixture } from './helpers/fixtures.js';
import { makeTestApp } from './helpers/make-app.js';

describe('POST /api/issues/:n/messages', () => {
  it('creates the thread on first message and returns 201 with thread payload', async () => {
    const { app, source, store } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));

    expect(store.threads.findByIssue('octo', 'hello', 7)).toBeNull();

    const res = await request(app).post('/api/issues/7/messages').send({ body: 'kick off' });

    expect(res.status).toBe(201);
    expect(res.body.message.body).toBe('kick off');
    expect(res.body.message.role).toBe('user');
    expect(res.body.message.threadId).toBeTypeOf('number');
    expect(res.body.thread).not.toBeNull();
    expect(res.body.thread.messages).toHaveLength(1);
    expect(res.body.thread.messages[0].body).toBe('kick off');
    expect(res.body.thread.activeRun).toBeNull();

    expect(store.threads.findByIssue('octo', 'hello', 7)).not.toBeNull();
  });

  it('reuses an existing thread on subsequent messages', async () => {
    const { app, source, store } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));

    const first = await request(app).post('/api/issues/7/messages').send({ body: 'first' });
    const second = await request(app).post('/api/issues/7/messages').send({ body: 'second' });

    expect(first.body.message.threadId).toBe(second.body.message.threadId);
    expect(second.body.thread.messages).toHaveLength(2);
    expect(second.body.thread.messages.map((m: { body: string }) => m.body)).toEqual([
      'first',
      'second',
    ]);

    const threads = store.threads.list();
    expect(threads).toHaveLength(1);
  });

  it('persists messages so a fresh GET sees them', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));

    await request(app).post('/api/issues/7/messages').send({ body: 'hello' });
    await request(app).post('/api/issues/7/messages').send({ body: 'are you there' });

    const res = await request(app).get('/api/issues/7');
    expect(res.body.thread).not.toBeNull();
    expect(res.body.thread.messages).toHaveLength(2);
    expect(res.body.thread.messages[0].body).toBe('hello');
    expect(res.body.thread.messages[1].body).toBe('are you there');
  });

  it('rejects empty body', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues/7/messages').send({ body: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('rejects missing body', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues/7/messages').send({});
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields', async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .post('/api/issues/7/messages')
      .send({ body: 'hi', role: 'agent' });
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric path', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/issues/abc/messages').send({ body: 'hi' });
    expect(res.status).toBe(400);
  });

  it('does not call the GitHub source', async () => {
    const { app, source } = makeTestApp();
    source.setIssue(issueFixture(7, 'lucky'));
    source.failAddComment(500, 'must not be called');

    const res = await request(app).post('/api/issues/7/messages').send({ body: 'hi' });
    expect(res.status).toBe(201);
  });
});
