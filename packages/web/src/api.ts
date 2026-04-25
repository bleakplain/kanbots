import type { Comment, Config, Issue, IssueDetail, UpdateIssuePatch } from './types.js';

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body != null ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      detail = body.message ? `: ${body.message}` : body.error ? `: ${body.error}` : '';
    } catch {
      // ignore
    }
    throw new Error(`${res.status} ${res.statusText} on ${path}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  config: (): Promise<Config> => send('/api/config'),
  issues: (state: 'open' | 'closed' | 'all' = 'open'): Promise<Issue[]> =>
    send(`/api/issues?state=${state}`),
  issue: (n: number): Promise<IssueDetail> => send(`/api/issues/${n}`),
  updateIssue: (n: number, patch: UpdateIssuePatch): Promise<Issue> =>
    send(`/api/issues/${n}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  addComment: (n: number, body: string): Promise<Comment> =>
    send(`/api/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
};
