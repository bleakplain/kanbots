import type { ReactNode } from 'react';

export interface BoardToolbarProps {
  crumbs: ReactNode;
  onOpenPalette?: (() => void) | undefined;
  onOpenAutopilot?: (() => void) | undefined;
  onCreate?: (() => void) | undefined;
  createLabel?: string | undefined;
  createKbd?: string | undefined;
  /** Disable the Autopilot button (cloud mode shows tooltip until the endpoint lands). */
  autopilotDisabled?: boolean | undefined;
  autopilotDisabledTitle?: string | undefined;
  /** Extra trailing action buttons — used by cloud mode for "Refresh" / "Switch workspace". */
  trailingActions?: ReactNode;
}

const searchIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

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

/**
 * Shared board toolbar: breadcrumbs on the left, command-palette search,
 * Autopilot, and Create buttons on the right. Cloud mode supplies extra
 * trailing actions and disables Autopilot until phase 3.
 */
export function BoardToolbar({
  crumbs,
  onOpenPalette,
  onOpenAutopilot,
  onCreate,
  createLabel = 'New task',
  createKbd = 'N',
  autopilotDisabled = false,
  autopilotDisabledTitle,
  trailingActions,
}: BoardToolbarProps) {
  return (
    <div className="kb-board-toolbar">
      <div className="kb-crumbs">{crumbs}</div>
      <div className="kb-toolbar-actions">
        <button
          type="button"
          className="kb-search"
          onClick={() => onOpenPalette?.()}
          aria-label="Open command palette"
        >
          {searchIcon}
          <span>Search issues, branches, agents…</span>
          <span className="kb-search-kbd">⌘K</span>
        </button>
        <button
          type="button"
          className="kb-btn ghost"
          onClick={() => onOpenAutopilot?.()}
          title={autopilotDisabled ? autopilotDisabledTitle : 'Start an autopilot session'}
          disabled={autopilotDisabled}
        >
          Autopilot
        </button>
        <button type="button" className="kb-btn primary" onClick={() => onCreate?.()}>
          {plusIcon} {createLabel} <span className="kb-kbd">{createKbd}</span>
        </button>
        {trailingActions}
      </div>
    </div>
  );
}
