import type { IssueSource } from '@kanbots/core';
import type { Store } from '@kanbots/local-store';
import express, { type Express } from 'express';
import type { AgentSupervisor } from './agent-runs/supervisor.js';
import { errorHandler } from './error-handler.js';
import { agentActionsRouter } from './routes/agent-actions.js';
import { agentChecksRouter } from './routes/agent-checks.js';
import { agentDiffRouter } from './routes/agent-diff.js';
import { agentPreviewRouter } from './routes/agent-preview.js';
import { agentRunsRouter } from './routes/agent-runs.js';
import { cardsRouter } from './routes/cards.js';
import { composerRouter, type DraftIssueFn } from './routes/composer.js';
import { configHandler, type ConfigPayload } from './routes/config.js';
import { costRouter } from './routes/cost.js';
import { decisionsRouter } from './routes/decisions.js';
import { healthHandler } from './routes/health.js';
import { issuesRouter } from './routes/issues.js';
import { workspaceRouter } from './routes/workspace.js';

export interface AppDeps {
  source: IssueSource;
  store: Store;
  config: ConfigPayload;
  draftIssue: DraftIssueFn;
  supervisor: AgentSupervisor;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', healthHandler);
  app.get('/api/config', configHandler(deps));
  app.use('/api', issuesRouter(deps));
  app.use('/api', composerRouter({ draftIssue: deps.draftIssue }));
  app.use('/api', agentRunsRouter({ supervisor: deps.supervisor }));
  app.use('/api', cardsRouter({ store: deps.store, supervisor: deps.supervisor }));
  app.use('/api', agentDiffRouter({ store: deps.store }));
  app.use('/api', decisionsRouter({ store: deps.store, config: deps.config }));
  app.use('/api', workspaceRouter({ store: deps.store, config: deps.config }));
  app.use('/api', agentChecksRouter({ store: deps.store }));
  app.use('/api', agentPreviewRouter({ store: deps.store }));
  app.use(
    '/api',
    agentActionsRouter({ store: deps.store, source: deps.source, supervisor: deps.supervisor }),
  );
  app.use('/api', costRouter({ store: deps.store }));

  app.use(errorHandler);

  return app;
}
