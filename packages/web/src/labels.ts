import type { StatusKey } from './types.js';

export interface ColumnDef {
  key: StatusKey | null;
  label: string;
}

export const COLUMNS: readonly ColumnDef[] = [
  { key: null, label: 'Inbox' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'Todo' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

export const STATUS_LABEL: Record<StatusKey, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  inProgress: 'In progress',
  review: 'Review',
  done: 'Done',
};
