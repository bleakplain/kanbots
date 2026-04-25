import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { KanbotsAuthError } from '@kanbots/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initCommand } from '../src/commands/init.js';
import { FakeGitHubClient } from './helpers/fake-client.js';
import { MemoryLogger } from './helpers/memory-logger.js';

const execFileAsync = promisify(execFile);

async function gitInit(dir: string): Promise<void> {
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: dir });
}

async function addRemote(dir: string, url: string): Promise<void> {
  await execFileAsync('git', ['remote', 'add', 'origin', url], { cwd: dir });
}

describe('init command', () => {
  let dir: string;
  let log: MemoryLogger;
  let client: FakeGitHubClient;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kanbots-init-'));
    await gitInit(dir);
    await addRemote(dir, 'https://github.com/octo/hello.git');
    log = new MemoryLogger();
    client = new FakeGitHubClient();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('initializes a fresh repo', async () => {
    const code = await initCommand([], {
      cwd: dir,
      logger: log,
      resolveToken: async () => 'test-token',
      createClient: () => client,
    });

    expect(code).toBe(0);
    expect(client.getRepoCalls).toBe(1);
    expect(client.ensureLabelsCalls).toBe(1);

    expect(existsSync(join(dir, '.kanbots'))).toBe(true);
    expect(existsSync(join(dir, '.kanbots', 'db.sqlite'))).toBe(true);
    expect(existsSync(join(dir, '.kanbots', 'worktrees'))).toBe(true);

    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.kanbots/');

    expect(log.successes.some((m) => m.includes('octo/hello'))).toBe(true);
    expect(log.successes.some((m) => m.includes('Repository access verified'))).toBe(true);
    expect(log.failures).toHaveLength(0);
  });

  it('is idempotent across runs', async () => {
    const first = await initCommand([], {
      cwd: dir,
      logger: log,
      resolveToken: async () => 't',
      createClient: () => client,
    });
    expect(first).toBe(0);

    const log2 = new MemoryLogger();
    const client2 = new FakeGitHubClient();
    const second = await initCommand([], {
      cwd: dir,
      logger: log2,
      resolveToken: async () => 't',
      createClient: () => client2,
    });

    expect(second).toBe(0);
    expect(client2.ensureLabelsCalls).toBe(1);
    expect(log2.successes.some((m) => m.includes('already in .gitignore'))).toBe(true);
    expect(log2.failures).toHaveLength(0);
  });

  it('preserves an existing .gitignore', async () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
    const code = await initCommand([], {
      cwd: dir,
      logger: log,
      resolveToken: async () => 't',
      createClient: () => client,
    });
    expect(code).toBe(0);
    const content = readFileSync(join(dir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('.kanbots/');
  });

  it('fails when not in a git repo', async () => {
    const noGit = mkdtempSync(join(tmpdir(), 'nogit-'));
    try {
      const code = await initCommand([], {
        cwd: noGit,
        logger: log,
        resolveToken: async () => 't',
        createClient: () => client,
      });
      expect(code).toBe(1);
      expect(log.failures.some((m) => m.toLowerCase().includes('git'))).toBe(true);
      expect(client.getRepoCalls).toBe(0);
    } finally {
      rmSync(noGit, { recursive: true, force: true });
    }
  });

  it('fails when no GitHub remote is configured', async () => {
    const noRemote = mkdtempSync(join(tmpdir(), 'noremote-'));
    await gitInit(noRemote);
    try {
      const code = await initCommand([], {
        cwd: noRemote,
        logger: log,
        resolveToken: async () => 't',
        createClient: () => client,
      });
      expect(code).toBe(1);
      expect(log.failures.some((m) => m.toLowerCase().includes('github'))).toBe(true);
      expect(client.getRepoCalls).toBe(0);
    } finally {
      rmSync(noRemote, { recursive: true, force: true });
    }
  });

  it('fails when remote is not GitHub', async () => {
    const otherDir = mkdtempSync(join(tmpdir(), 'gitlab-'));
    await gitInit(otherDir);
    await addRemote(otherDir, 'https://gitlab.com/octo/hello.git');
    try {
      const code = await initCommand([], {
        cwd: otherDir,
        logger: log,
        resolveToken: async () => 't',
        createClient: () => client,
      });
      expect(code).toBe(1);
      expect(log.failures.some((m) => m.toLowerCase().includes('github'))).toBe(true);
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it('reports auth error helpfully when token resolution fails', async () => {
    const code = await initCommand([], {
      cwd: dir,
      logger: log,
      resolveToken: async () => {
        throw new KanbotsAuthError(
          [
            'No GitHub token found. Try one of:',
            '  - Run `gh auth login` (recommended)',
            '  - Set GITHUB_TOKEN environment variable',
            '  - Write a token to ~/.kanbots/token',
          ].join('\n'),
        );
      },
      createClient: () => client,
    });

    expect(code).toBe(1);
    expect(log.failures.some((m) => m.includes('authentication'))).toBe(true);
    expect(log.raws.some((m) => m.includes('gh auth login'))).toBe(true);
    expect(client.getRepoCalls).toBe(0);
  });

  it('reports 401 with a clear message and skips later steps', async () => {
    client.getRepoImpl = FakeGitHubClient.reject(401, 'Bad credentials');
    const code = await initCommand([], {
      cwd: dir,
      logger: log,
      resolveToken: async () => 'bad',
      createClient: () => client,
    });
    expect(code).toBe(1);
    expect(log.failures.some((m) => m.includes('401'))).toBe(true);
    expect(client.ensureLabelsCalls).toBe(0);
    expect(existsSync(join(dir, '.kanbots'))).toBe(false);
  });

  it('reports 404 when repo is not visible', async () => {
    client.getRepoImpl = FakeGitHubClient.reject(404, 'Not Found');
    const code = await initCommand([], {
      cwd: dir,
      logger: log,
      resolveToken: async () => 't',
      createClient: () => client,
    });
    expect(code).toBe(1);
    expect(
      log.failures.some((m) => m.toLowerCase().includes('not found') || m.includes('octo/hello')),
    ).toBe(true);
  });

  it('parses ssh remote URLs', async () => {
    const sshDir = mkdtempSync(join(tmpdir(), 'ssh-'));
    await gitInit(sshDir);
    await addRemote(sshDir, 'git@github.com:octo/hello.git');
    try {
      const code = await initCommand([], {
        cwd: sshDir,
        logger: log,
        resolveToken: async () => 't',
        createClient: () => client,
      });
      expect(code).toBe(0);
      expect(log.successes.some((m) => m.includes('octo/hello'))).toBe(true);
    } finally {
      rmSync(sshDir, { recursive: true, force: true });
    }
  });
});
