import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers/make-app.js';

describe('GET /api/config', () => {
  it('returns owner and repo', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ owner: 'octo', repo: 'hello' });
  });
});
