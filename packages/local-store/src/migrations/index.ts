import { migration as m0001 } from './0001-initial.js';
import type { Migration } from './types.js';

export const migrations: readonly Migration[] = [m0001];

export type { Migration };
