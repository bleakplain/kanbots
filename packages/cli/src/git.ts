import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitHubRepo {
  owner: string;
  repo: string;
}

export async function findGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getRemoteUrl(cwd: string, name = 'origin'): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', name], {
      cwd,
      encoding: 'utf-8',
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export function parseGitHubRemote(url: string): GitHubRepo | null {
  const trimmed = url.trim();

  // SSH: git@github.com:owner/repo[.git]
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // ssh://git@github.com/owner/repo[.git]
  const sshUrlMatch = /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(trimmed);
  if (sshUrlMatch?.[1] && sshUrlMatch[2]) {
    return { owner: sshUrlMatch[1], repo: sshUrlMatch[2] };
  }

  // https://github.com/owner/repo[.git]
  const httpsMatch = /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(
    trimmed,
  );
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

export async function detectGitHubRepo(cwd: string): Promise<GitHubRepo | null> {
  const url = await getRemoteUrl(cwd);
  if (!url) return null;
  return parseGitHubRemote(url);
}
