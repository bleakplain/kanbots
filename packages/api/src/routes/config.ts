import type { RequestHandler } from 'express';

export interface ConfigPayload {
  owner: string;
  repo: string;
  mode?: 'github' | 'local';
  repoPath?: string;
  authorLogin?: string;
}

export function configHandler(deps: { config: ConfigPayload }): RequestHandler {
  return (_req, res) => {
    // Don't leak the absolute repoPath to the renderer in production usage
    // unless the host already exposes it.
    const { repoPath, ...rest } = deps.config;
    res.json({ ...rest, ...(repoPath ? { repoPath } : {}) });
  };
}
