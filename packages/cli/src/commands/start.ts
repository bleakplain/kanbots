import { existsSync } from 'node:fs';
import { startServer, type ApiGitHubClient } from '@kanbots/api';
import { GitHubClient, KanbotsAuthError, resolveGitHubToken } from '@kanbots/core';
import { openStore, type Store } from '@kanbots/local-store';
import { detectGitHubRepo, findGitRoot } from '../git.js';
import { describeKanbotsDir } from '../kanbots-dir.js';
import { consoleLogger, type Logger } from '../ui.js';

export interface StartDeps {
  cwd?: string;
  logger?: Logger;
  resolveToken?: () => Promise<string>;
  port?: number;
  createClient?: (opts: { owner: string; repo: string; token: string; store: Store }) => ApiGitHubClient;
  signal?: AbortSignal;
}

export async function startCommand(args: string[] = [], deps: StartDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const log = deps.logger ?? consoleLogger;
  const resolveToken = deps.resolveToken ?? (() => resolveGitHubToken());
  const port = parsePort(args) ?? deps.port ?? 3737;

  const gitRoot = await findGitRoot(cwd);
  if (!gitRoot) {
    log.failure('Not inside a git repository.');
    return 1;
  }

  const repo = await detectGitHubRepo(gitRoot);
  if (!repo) {
    log.failure('No GitHub remote found.');
    return 1;
  }

  const kdir = describeKanbotsDir(gitRoot);
  if (!existsSync(kdir.dbPath)) {
    log.failure('.kanbots/ not initialized — run `kanbots init` first.');
    return 1;
  }

  let token: string;
  try {
    token = await resolveToken();
  } catch (err) {
    if (err instanceof KanbotsAuthError) {
      log.failure('GitHub authentication failed.');
      for (const line of err.message.split('\n')) log.raw(`  ${line}`);
      return 1;
    }
    throw err;
  }

  const store = openStore({ path: kdir.dbPath });

  const createClient =
    deps.createClient ??
    ((opts) =>
      new GitHubClient({
        owner: opts.owner,
        repo: opts.repo,
        token: opts.token,
        cache: opts.store.httpCache,
      }));

  const client = createClient({ owner: repo.owner, repo: repo.repo, token, store });

  const server = await startServer({
    client,
    store,
    config: { owner: repo.owner, repo: repo.repo },
    port,
  });

  log.success(`kanbots is running on http://${server.host}:${server.port}`);
  log.info('In dev: run `pnpm --filter @kanbots/web dev` to view the UI on http://127.0.0.1:5173');
  log.info('Press Ctrl+C to stop');

  return await new Promise<number>((resolve) => {
    const shutdown = async (): Promise<void> => {
      log.info('Shutting down…');
      try {
        await server.close();
      } finally {
        store.close();
      }
      resolve(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    if (deps.signal) {
      if (deps.signal.aborted) {
        void shutdown();
      } else {
        deps.signal.addEventListener('abort', () => void shutdown(), { once: true });
      }
    }
  });
}

function parsePort(args: readonly string[]): number | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      const next = args[i + 1];
      if (next) return parseIntOrUndefined(next);
    }
    if (arg) {
      const m = /^--port=(\d+)$/.exec(arg);
      if (m?.[1]) return parseInt(m[1], 10);
    }
  }
  return undefined;
}

function parseIntOrUndefined(s: string): number | undefined {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}
