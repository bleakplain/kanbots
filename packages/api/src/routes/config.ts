import type { RequestHandler } from 'express';

export interface ConfigPayload {
  owner: string;
  repo: string;
}

export function configHandler(deps: { config: ConfigPayload }): RequestHandler {
  return (_req, res) => {
    res.json(deps.config);
  };
}
