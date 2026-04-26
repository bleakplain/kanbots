import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers/make-app.js';

describe('POST /api/composer/draft', () => {
  it('returns the drafted issue and forwards the description to the agent', async () => {
    const { app, draftIssue } = makeTestApp();
    draftIssue.setNextResponse({
      title: 'Add dark mode toggle',
      body: '## Problem\nUsers want dark mode.\n\n## Acceptance\n- toggle persists',
    });

    const res = await request(app)
      .post('/api/composer/draft')
      .send({ description: 'I want a dark mode for the app' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Add dark mode toggle');
    expect(res.body.body).toContain('## Problem');
    expect(draftIssue.calls).toHaveLength(1);
    expect(draftIssue.calls[0]!.description).toBe('I want a dark mode for the app');
  });

  it('rejects empty description', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/composer/draft').send({ description: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('rejects missing description', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/composer/draft').send({});
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/composer/draft').send({ description: 'x', extra: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 500 when the agent fails', async () => {
    const { app, draftIssue } = makeTestApp();
    draftIssue.setNextError(new Error('agent timed out'));
    const res = await request(app).post('/api/composer/draft').send({ description: 'x' });
    expect(res.status).toBe(500);
    expect(res.body.message).toContain('agent timed out');
  });
});
