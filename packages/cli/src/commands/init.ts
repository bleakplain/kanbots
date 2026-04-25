import { GitHubClient, KanbotsAuthError, resolveGitHubToken } from '@kanbots/core';
import { openStore } from '@kanbots/local-store';
import { detectGitHubRepo, findGitRoot } from '../git.js';
import { ensureGitignoreEntry } from '../gitignore.js';
import { ensureKanbotsDir } from '../kanbots-dir.js';
import { consoleLogger, type Logger } from '../ui.js';

export interface InitClient {
  getRepo: () => Promise<unknown>;
  ensureLabels: () => Promise<void>;
}

export interface InitDeps {
  cwd?: string;
  logger?: Logger;
  resolveToken?: () => Promise<string>;
  createClient?: (opts: { owner: string; repo: string; token: string }) => InitClient;
}

export async function initCommand(_args: string[] = [], deps: InitDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const log = deps.logger ?? consoleLogger;
  const resolveToken = deps.resolveToken ?? (() => resolveGitHubToken());
  const createClient = deps.createClient ?? ((opts) => new GitHubClient(opts));

  const gitRoot = await findGitRoot(cwd);
  if (!gitRoot) {
    log.failure('Not inside a git repository.');
    log.raw('  Run `git init` first, then re-run kanbots init.');
    return 1;
  }
  log.success(`Git repository: ${gitRoot}`);

  const repo = await detectGitHubRepo(gitRoot);
  if (!repo) {
    log.failure('No GitHub remote found.');
    log.raw('  kanbots is GitHub-only. Add a github.com remote and try again.');
    return 1;
  }
  log.success(`GitHub repository: ${repo.owner}/${repo.repo}`);

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
  log.success('GitHub token resolved');

  const client = createClient({ owner: repo.owner, repo: repo.repo, token });

  try {
    await client.getRepo();
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      log.failure('GitHub token rejected (401). Check that your token is valid.');
    } else if (status === 403) {
      log.failure('GitHub returned 403. Token may lack the required repo access.');
    } else if (status === 404) {
      log.failure(
        `Repository ${repo.owner}/${repo.repo} not found, or not visible to your token.`,
      );
    } else {
      log.failure(`GitHub request failed: ${(err as Error).message}`);
    }
    return 1;
  }
  log.success('Repository access verified');

  try {
    await client.ensureLabels();
  } catch (err) {
    log.failure(`Failed to ensure labels: ${(err as Error).message}`);
    return 1;
  }
  log.success('Kanbots labels ensured (status:*, agent:*)');

  const kdir = await ensureKanbotsDir(gitRoot);
  log.success(`Created ${kdir.root}`);

  const store = openStore({ path: kdir.dbPath });
  store.close();
  log.success(`Initialized database at ${kdir.dbPath}`);

  const added = await ensureGitignoreEntry(gitRoot, '.kanbots/');
  log.success(added ? 'Added .kanbots/ to .gitignore' : '.kanbots/ already in .gitignore');

  log.raw('');
  log.raw('kanbots is ready. Run `kanbots` to start the app.');
  return 0;
}
