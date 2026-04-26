import { useDroppable } from '@dnd-kit/core';
import type { Issue, StatusKey } from '../types.js';
import { Card } from './Card.js';
import type { RunLiveMap } from '../hooks/useBoardAgentStreams.js';

export function columnDropId(key: StatusKey | null): string {
  return `col:${key ?? 'inbox'}`;
}

const plusIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export interface ColumnProps {
  columnKey: StatusKey | null;
  status: 'inbox' | StatusKey;
  label: string;
  issues: Issue[];
  selectedNumber?: number | null;
  liveByRun?: RunLiveMap;
  onSelect?: (n: number) => void;
  onOpen?: (n: number) => void;
  onAdd?: (status: StatusKey | null) => void;
}

export function Column({
  columnKey,
  status,
  label,
  issues,
  selectedNumber = null,
  liveByRun,
  onSelect,
  onOpen,
  onAdd,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(columnKey) });
  return (
    <div ref={setNodeRef} className="kb-col" data-over={isOver ? 'true' : undefined}>
      <div className="kb-col-head" data-status={status}>
        <span className="kb-col-glyph" aria-hidden />
        <span className="kb-col-name">{label}</span>
        <span className="kb-col-count">{issues.length}</span>
        {onAdd ? (
          <button
            type="button"
            className="kb-col-add"
            title="Add issue"
            aria-label={`Add issue to ${label}`}
            onClick={() => onAdd(columnKey)}
          >
            {plusIcon}
          </button>
        ) : null}
      </div>
      <div className="kb-col-list">
        {issues.length === 0 ? (
          <div className="kb-col-empty">—</div>
        ) : (
          issues.map((issue) => {
            const live =
              issue.activeRun && liveByRun?.get(issue.activeRun.id)?.currentTool
                ? {
                    name: liveByRun.get(issue.activeRun.id)!.currentTool!,
                    arg: liveByRun.get(issue.activeRun.id)?.currentArg ?? null,
                  }
                : null;
            return (
              <Card
                key={issue.number}
                issue={issue}
                selected={selectedNumber === issue.number}
                liveTool={live}
                onSelect={onSelect ?? (() => undefined)}
                onOpen={onOpen ?? (() => undefined)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
