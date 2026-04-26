import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp } from './helpers/make-app.js';

describe('GET /api/workspace', () => {
  it('returns the bootstrap fallback when host has no repoPath', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/workspace');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'default',
      name: 'kanbots workspace',
      currentFolderId: 'unknown',
    });
  });

  it('bootstraps a workspace + folder when repoPath is set', async () => {
    const { app } = makeTestApp({ configOverride: { repoPath: '/tmp/example-repo' } });
    const res = await request(app).get('/api/workspace');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('default');
    expect(res.body.name).toBe('kanbots workspace');
    expect(res.body.currentFolderId).not.toBe('unknown');
    expect(typeof res.body.currentFolderId).toBe('string');
  });

  it('is idempotent across calls', async () => {
    const { app } = makeTestApp({ configOverride: { repoPath: '/tmp/example-repo' } });
    const a = await request(app).get('/api/workspace');
    const b = await request(app).get('/api/workspace');
    expect(b.body.currentFolderId).toBe(a.body.currentFolderId);
  });
});

describe('GET /api/folders', () => {
  it('returns [] when host has no repoPath', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/folders');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns the current folder marked current=true', async () => {
    const { app } = makeTestApp({ configOverride: { repoPath: '/tmp/example-repo' } });
    const res = await request(app).get('/api/folders');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].current).toBe(true);
    expect(res.body[0].path).toBe('/tmp/example-repo');
  });
});

describe('POST /api/folders', () => {
  it('400s when host has no repoPath', async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .post('/api/folders')
      .send({ name: 'extra', path: '/tmp/extra' });
    expect(res.status).toBe(400);
  });

  it('persists a new folder', async () => {
    const { app } = makeTestApp({ configOverride: { repoPath: '/tmp/example-repo' } });
    const res = await request(app)
      .post('/api/folders')
      .send({ name: 'extra', path: '/tmp/extra-folder' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('extra');
    expect(res.body.current).toBe(false);

    const list = await request(app).get('/api/folders');
    expect(list.body).toHaveLength(2);
  });

  it('rejects empty body', async () => {
    const { app } = makeTestApp({ configOverride: { repoPath: '/tmp/example-repo' } });
    const res = await request(app).post('/api/folders').send({});
    expect(res.status).toBe(400);
  });

  it('is idempotent on duplicate path (returns the existing row)', async () => {
    const { app } = makeTestApp({ configOverride: { repoPath: '/tmp/example-repo' } });
    const a = await request(app)
      .post('/api/folders')
      .send({ name: 'extra', path: '/tmp/dup' });
    const b = await request(app)
      .post('/api/folders')
      .send({ name: 'duplicate', path: '/tmp/dup' });
    expect(b.status).toBe(201);
    // FoldersRepo.ensure is idempotent on path, so same row returns
    expect(b.body.id).toBe(a.body.id);
  });
});
