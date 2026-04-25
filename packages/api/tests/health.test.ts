import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers/make-app.js';

describe('GET /healthz', () => {
  it('returns 200 ok', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
    expect(res.headers['content-type']).toContain('text/plain');
  });
});
