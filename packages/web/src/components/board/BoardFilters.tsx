export interface BoardFiltersStats {
  issues: number;
  runs: number;
  awaiting: number;
  costToday: number;
}

export interface BoardFiltersControls {
  hasAgent: boolean;
  priorities: ReadonlySet<string>;
  areas: ReadonlySet<string>;
  availablePriorities: readonly string[];
  availableAreas: readonly string[];
  onToggleHasAgent: () => void;
  onTogglePriority: (p: string) => void;
  onToggleArea: (a: string) => void;
  onClear: () => void;
}

export interface BoardFiltersProps {
  stats: BoardFiltersStats;
  /** Pass null in cloud mode (phase 1) — only the Open pill + stats render. */
  controls: BoardFiltersControls | null;
}

/**
 * Shared filter row: "Open" pill + optional toggleable pills for has-agent /
 * priority / area + stats summary. Cloud mode passes `controls={null}` until
 * filter state and label parity land in a later phase.
 */
export function BoardFilters({ stats, controls }: BoardFiltersProps) {
  const anyOn =
    controls !== null &&
    (controls.hasAgent || controls.priorities.size > 0 || controls.areas.size > 0);
  return (
    <div className="kb-filter-row">
      <span className="kb-pill on" title="Only open issues are loaded">
        <span className="kb-pill-x" />
        Open
      </span>
      {controls !== null ? (
        <>
          <button
            type="button"
            className={`kb-pill${controls.hasAgent ? ' on kb-pill-running' : ''}`}
            onClick={controls.onToggleHasAgent}
            aria-pressed={controls.hasAgent}
          >
            {controls.hasAgent ? <span className="kb-pill-x" /> : null}
            Has agent
          </button>
          {controls.availablePriorities.map((p) => {
            const on = controls.priorities.has(p);
            return (
              <button
                key={p}
                type="button"
                className={`kb-pill${on ? ' on' : ''}`}
                onClick={() => controls.onTogglePriority(p)}
                aria-pressed={on}
              >
                {on ? <span className="kb-pill-x" /> : null}
                priority:{p}
              </button>
            );
          })}
          {controls.availableAreas.slice(0, 4).map((area) => {
            const on = controls.areas.has(area);
            return (
              <button
                key={area}
                type="button"
                className={`kb-pill${on ? ' on' : ''}`}
                onClick={() => controls.onToggleArea(area)}
                aria-pressed={on}
              >
                {on ? <span className="kb-pill-x" /> : null}
                {area}
              </button>
            );
          })}
          {anyOn ? (
            <button
              type="button"
              className="kb-pill"
              onClick={controls.onClear}
              title="Clear filters"
              style={{ color: 'var(--ink-3)' }}
            >
              clear
            </button>
          ) : null}
        </>
      ) : null}
      <span className="kb-stats-line">
        {stats.issues} issue{stats.issues === 1 ? '' : 's'} · {stats.runs} active run
        {stats.runs === 1 ? '' : 's'} · {stats.awaiting} awaiting
        {stats.costToday > 0 ? ` · $${stats.costToday.toFixed(2)} today` : ''}
      </span>
    </div>
  );
}
