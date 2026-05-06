import { useEffect, useState, type MouseEvent } from 'react';
import { getBridge } from '../desktop-bridge.js';
import { CloudSettingsModal } from './modals/CloudSettingsModal.js';
import type { CloudStatusPayload } from '../desktop-bridge.js';

export interface CloudFirstRunPromptProps {
  onDismissed: () => void;
  onSignedIn: () => void;
}

/**
 * Shown once on first launch when the user has neither signed in to Kanbots
 * Cloud nor explicitly opted out. Two CTAs: open the sign-in modal, or
 * "continue local-only" which records a dismissal so this never appears
 * again. The setting is reachable any time from the toolbar afterwards.
 */
export function CloudFirstRunPrompt({ onDismissed, onSignedIn }: CloudFirstRunPromptProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // Intentionally do not close on Escape — the user must make an explicit
      // choice. The "Continue local-only" button is always one click away.
      if (e.key === 'Escape') e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function handleContinueLocal(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const bridge = getBridge();
    if (bridge) {
      try {
        await bridge.cloudPromptDismiss();
      } catch {
        // best-effort: even if the dismissal write fails, fall through and
        // let the user start working. They'll just see the prompt again next
        // launch.
      }
    }
    setBusy(false);
    onDismissed();
  }

  function handleStatusChange(status: CloudStatusPayload): void {
    if (status.authed) {
      // Signed-in users won't be re-prompted; the dismissal flag is implicit
      // in the auth file the modal just wrote.
      onSignedIn();
    }
  }

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  if (showSettings) {
    return (
      <CloudSettingsModal
        onClose={() => setShowSettings(false)}
        onChanged={handleStatusChange}
      />
    );
  }

  return (
    <div className="kb-modal-scrim" role="dialog" aria-modal="true">
      <div className="kb-modal sm" onMouseDown={stopInner}>
        <div className="kb-modal-head">
          <h2>Welcome to kanbots</h2>
          <span className="grow" />
        </div>
        <div className="kb-modal-body" style={{ display: 'grid', gap: 14 }}>
          <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.55 }}>
            kanbots runs entirely on your machine. Nothing leaves this device unless you sign
            in to a Kanbots Cloud account, in which case tasks and runs sync with your team.
          </p>
          <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.55 }}>
            Signing in is optional. You can switch later from the toolbar.
          </p>
        </div>
        <div
          className="kb-modal-foot"
          style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}
        >
          <button
            type="button"
            className="kb-btn ghost"
            onClick={() => void handleContinueLocal()}
            disabled={busy}
          >
            Continue local-only
          </button>
          <button
            type="button"
            className="kb-btn primary"
            onClick={() => setShowSettings(true)}
            disabled={busy}
          >
            Sign in to Kanbots Cloud
          </button>
        </div>
      </div>
    </div>
  );
}
