import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { resolveGitHubToken, TOKEN_FILE_PATH } from '@kanbots/core';
import { detectGitHubRepo, findGitRoot } from '../git.js';
import { describeKanbotsDir } from '../kanbots-dir.js';
import { consoleLogger, type Logger } from '../ui.js';

const execFileAsync = promisify(execFile);

export interface DoctorDeps {
  cwd?: string;
  logger?: Logger;
  resolveToken?: () => Promise<string>;
}

export async function doctorCommand(_args: string[] = [], deps: DoctorDeps = {}): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const log = deps.logger ?? consoleLogger;
  const resolveToken = deps.resolveToken ?? (() => resolveGitHubToken());
  let failures = 0;

  const nodeMajor = parseInt(process.version.replace(/^v/, '').split('.')[0] ?? '0', 10);
  if (nodeMajor >= 20) {
    log.success(`Node ${process.version}`);
  } else {
    log.failure(`Node ${process.version} (kanbots requires v20+)`);
    failures++;
  }

  try {
    const { stdout } = await execFileAsync('git', ['--version']);
    log.success(stdout.trim());
  } catch {
    log.failure('git not found');
    failures++;
  }

  const gitRoot = await findGitRoot(cwd);
  if (gitRoot) {
    log.success(`In git repo: ${gitRoot}`);
  } else {
    log.warn('Not inside a git repository');
    failures++;
  }

  if (gitRoot) {
    const repo = await detectGitHubRepo(gitRoot);
    if (repo) {
      log.success(`GitHub remote: ${repo.owner}/${repo.repo}`);
    } else {
      log.warn('No GitHub remote on origin');
      failures++;
    }
  }

  try {
    const { stdout } = await execFileAsync('gh', ['--version']);
    log.success(`gh CLI: ${stdout.split('\n')[0]?.trim() ?? 'present'}`);
  } catch {
    log.info('gh CLI not found (optional)');
  }

  try {
    await resolveToken();
    log.success('GitHub token resolved');
  } catch (err) {
    log.failure(`No GitHub token (${(err as Error).message.split('\n')[0]})`);
    failures++;
  }

  if (existsSync(TOKEN_FILE_PATH)) {
    log.info(`Token file: ${TOKEN_FILE_PATH}`);
  }
  if (process.env.GITHUB_TOKEN) {
    log.info('GITHUB_TOKEN env var is set');
  }

  if (gitRoot) {
    const kdir = describeKanbotsDir(gitRoot);
    if (existsSync(kdir.root)) {
      log.success(`.kanbots/ at ${kdir.root}`);
      log.info(
        existsSync(kdir.dbPath)
          ? `database: ${kdir.dbPath}`
          : 'database missing — run `kanbots init`',
      );
    } else {
      log.warn('.kanbots/ not initialized — run `kanbots init`');
    }
  }

  return failures > 0 ? 1 : 0;
}
