import { migration as m0001 } from './0001-initial.js';
import { migration as m0002 } from './0002-agent-session.js';
import { migration as m0003 } from './0003-local-issues.js';
import { migration as m0004 } from './0004-agent-model.js';
import { migration as m0005 } from './0005-workspaces-folders.js';
import { migration as m0006 } from './0006-agent-cost.js';
import { migration as m0007 } from './0007-agent-checks.js';
import { migration as m0008 } from './0008-agent-preview.js';
import { migration as m0009 } from './0009-autopilot-sessions.js';
import { migration as m0010 } from './0010-sentry.js';
import { migration as m0011 } from './0011-agent-stop-escalation.js';
import { migration as m0012 } from './0012-cost-budget.js';
import { migration as m0013 } from './0013-providers.js';
import { migration as m0014 } from './0014-agent-run-provider.js';
import { migration as m0015 } from './0015-thread-last-model.js';
import { migration as m0016 } from './0016-chat-conversations.js';
import { migration as m0017 } from './0017-codex-cli-provider.js';
import { migration as m0018 } from './0018-remove-api-key-providers.js';
import type { Migration } from './types.js';

export const migrations: readonly Migration[] = [
  m0001,
  m0002,
  m0003,
  m0004,
  m0005,
  m0006,
  m0007,
  m0008,
  m0009,
  m0010,
  m0011,
  m0012,
  m0013,
  m0014,
  m0015,
  m0016,
  m0017,
  m0018,
];

export type { Migration };
