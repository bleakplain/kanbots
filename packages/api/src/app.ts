import type { Store } from '@kanbots/local-store';
import express, { type Express } from 'express';
import { errorHandler } from './error-handler.js';
import { configHandler, type ConfigPayload } from './routes/config.js';
import { healthHandler } from './routes/health.js';
import { issuesRouter, type ApiGitHubClient } from './routes/issues.js';

export interface AppDeps {
  client: ApiGitHubClient;
  store: Store;
  config: ConfigPayload;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', healthHandler);
  app.get('/api/config', configHandler(deps));
  app.use('/api', issuesRouter(deps));

  app.use(errorHandler);

  return app;
}
