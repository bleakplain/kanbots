import { openDb, type Db } from './db.js';
import { migrations } from './migrations/index.js';
import { runMigrations } from './migrations/runner.js';
import { AgentEventsRepo } from './repos/agent-events.js';
import { AgentRunsRepo } from './repos/agent-runs.js';
import { CardsRepo } from './repos/cards.js';
import { HttpCacheRepo } from './repos/http-cache.js';
import { MessagesRepo } from './repos/messages.js';
import { PromotionsRepo } from './repos/promotions.js';
import { ThreadsRepo } from './repos/threads.js';

export interface Store {
  readonly threads: ThreadsRepo;
  readonly messages: MessagesRepo;
  readonly cards: CardsRepo;
  readonly agentRuns: AgentRunsRepo;
  readonly events: AgentEventsRepo;
  readonly promotions: PromotionsRepo;
  readonly httpCache: HttpCacheRepo;
  readonly db: Db;
  close(): void;
}

export interface OpenStoreOptions {
  path: string;
}

export function openStore(opts: OpenStoreOptions): Store {
  const db = openDb(opts.path);
  runMigrations(db, migrations);
  return wrap(db);
}

export function openStoreInMemory(): Store {
  return openStore({ path: ':memory:' });
}

function wrap(db: Db): Store {
  return {
    threads: new ThreadsRepo(db),
    messages: new MessagesRepo(db),
    cards: new CardsRepo(db),
    agentRuns: new AgentRunsRepo(db),
    events: new AgentEventsRepo(db),
    promotions: new PromotionsRepo(db),
    httpCache: new HttpCacheRepo(db),
    db,
    close: () => db.close(),
  };
}

export const PACKAGE_NAME = '@kanbots/local-store';

export type { Db } from './db.js';
export { migrations, runMigrations };
export type { Migration } from './migrations/types.js';

export { CardAlreadyResolvedError } from './repos/cards.js';
export type { CreateCardInput } from './repos/cards.js';
export type { CreateThreadInput } from './repos/threads.js';
export type { CreateMessageInput } from './repos/messages.js';
export type {
  CreateAgentRunInput,
  UpdateAgentRunPatch,
} from './repos/agent-runs.js';
export type {
  AppendAgentEventInput,
  ListAgentEventsOptions,
} from './repos/agent-events.js';
export type { CreatePromotionInput } from './repos/promotions.js';
export type { SetCacheInput } from './repos/http-cache.js';

export type {
  AgentEvent,
  AgentEventId,
  AgentEventType,
  AgentRun,
  AgentRunId,
  AgentRunStatus,
  CacheEntry,
  Card,
  CardId,
  CardStatus,
  CardType,
  Message,
  MessageId,
  Promotion,
  PromotionId,
  PromotionKind,
  Role,
  Thread,
  ThreadId,
} from './types.js';
