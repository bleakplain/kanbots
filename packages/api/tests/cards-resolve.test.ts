import type { Store } from '@kanbots/local-store';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers/make-app.js';

interface Setup {
  store: Store;
  threadId: number;
  runId: number;
  messageId: number;
  cardId: number;
}

function setupDecisionCard(store: Store): Setup {
  const thread = store.threads.create({
    repoOwner: 'octo',
    repoName: 'hello',
    issueNumber: 7,
  });
  const run = store.agentRuns.create({ threadId: thread.id, status: 'running' });
  store.agentRuns.update(run.id, {
    sessionId: 'session-abc',
    worktreePath: '/tmp/wt',
  });
  const message = store.messages.create({
    threadId: thread.id,
    role: 'agent',
    body: 'Awaiting decision: which?',
    agentRunId: run.id,
  });
  const card = store.cards.create({
    messageId: message.id,
    type: 'decision',
    payload: {
      question: 'which?',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    },
  });
  store.agentRuns.update(run.id, {
    status: 'awaiting_input',
    endedAt: new Date().toISOString(),
  });
  return {
    store,
    threadId: thread.id,
    runId: run.id,
    messageId: message.id,
    cardId: card.id,
  };
}

describe('POST /api/cards/:id/resolve', () => {
  it('resolves a decision and resumes the run', async () => {
    const { app, store, supervisor } = makeTestApp();
    const s = setupDecisionCard(store);

    const res = await request(app).post(`/api/cards/${s.cardId}/resolve`).send({ value: 'a' });

    expect(res.status).toBe(200);
    expect(res.body.card.status).toBe('resolved');
    expect(res.body.run.status).toBe('running');
    expect(res.body.run.id).toBe(s.runId);
    expect(supervisor.calls.map((c) => c.type)).toEqual(['resume']);
  });

  it('rejects values not in options', async () => {
    const { app, store } = makeTestApp();
    const s = setupDecisionCard(store);

    const res = await request(app).post(`/api/cards/${s.cardId}/resolve`).send({ value: 'c' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('not in options');
  });

  it('rejects empty value', async () => {
    const { app, store } = makeTestApp();
    const s = setupDecisionCard(store);
    const res = await request(app).post(`/api/cards/${s.cardId}/resolve`).send({ value: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing card', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/cards/9999/resolve').send({ value: 'a' });
    expect(res.status).toBe(404);
  });

  it('rejects non-decision card types', async () => {
    const { app, store } = makeTestApp();
    const thread = store.threads.create({
      repoOwner: 'octo',
      repoName: 'hello',
      issueNumber: 7,
    });
    const run = store.agentRuns.create({ threadId: thread.id, status: 'running' });
    const msg = store.messages.create({
      threadId: thread.id,
      role: 'agent',
      body: '',
      agentRunId: run.id,
    });
    const card = store.cards.create({
      messageId: msg.id,
      type: 'confirmation',
      payload: {},
    });
    const res = await request(app).post(`/api/cards/${card.id}/resolve`).send({ value: 'a' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/agent-runs/:id/cards', () => {
  it('returns cards for a run', async () => {
    const { app, store } = makeTestApp();
    const s = setupDecisionCard(store);
    const res = await request(app).get(`/api/agent-runs/${s.runId}/cards`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(s.cardId);
  });

  it('returns empty for a run with no cards', async () => {
    const { app, store } = makeTestApp();
    const thread = store.threads.create({
      repoOwner: 'octo',
      repoName: 'hello',
      issueNumber: 1,
    });
    const run = store.agentRuns.create({ threadId: thread.id, status: 'running' });
    const res = await request(app).get(`/api/agent-runs/${run.id}/cards`);
    expect(res.body).toEqual([]);
  });
});
