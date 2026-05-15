import { useEffect, useState, type MouseEvent } from 'react';
import { Logo } from './Logo.js';
import { CloudSettingsModal } from './modals/CloudSettingsModal.js';
import type { CloudStatusPayload } from '../desktop-bridge.js';

// Cloud-only launch: the gate is now non-dismissible. `onDismissed` was
// removed from the props; sign-in is the only exit.
export interface CloudFirstRunPromptProps {
  onSignedIn: () => void;
}

const CheckIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M5 12l5 5L20 7" />
  </svg>
);

const HeroIcon = (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="13" y="3" width="8" height="6" rx="1.5" />
    <rect x="13" y="11" width="8" height="10" rx="1.5" fill="currentColor" opacity="0.85" />
  </svg>
);

/**
 * Cloud-only launch: shown whenever the user is not signed in to Kanbots
 * Cloud. The gate has no dismissal — sign-in is the only path forward.
 */
export function CloudFirstRunPrompt({ onSignedIn }: CloudFirstRunPromptProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [busy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleStatusChange(status: CloudStatusPayload): void {
    if (status.authed) onSignedIn();
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
      <div className="kb-cloud-modal" onMouseDown={stopInner}>
        <div className="kb-cloud-modal-head">
          <Logo size={14} />
          <span className="kb-cloud-modal-head-title">Welcome to kanbots</span>
          <span className="grow" />
        </div>

        <div className="kb-cloud-modal-body">
          <div className="kb-cloud-hero">
            <div className="kb-cloud-hero-icon" style={{ color: 'var(--accent)' }}>
              {HeroIcon}
            </div>
            <h2 className="kb-cloud-hero-title">Sign in to continue</h2>
            <p className="kb-cloud-hero-tagline">
              kanbots requires a Kanbots Cloud account. Sign in to access your
              boards, dispatch agents, and sync with your team.
            </p>
          </div>

          <ul
            className="kb-cloud-features"
            style={{ listStyle: 'none', padding: '12px 14px', margin: 0 }}
          >
            <li className="kb-cloud-feature">
              <span className="kb-cloud-feature-icon">{CheckIcon}</span>
              <span>Agents and code stay on your machine</span>
            </li>
            <li className="kb-cloud-feature">
              <span className="kb-cloud-feature-icon">{CheckIcon}</span>
              <span>Sync boards and runs across your team and devices</span>
            </li>
            <li className="kb-cloud-feature">
              <span className="kb-cloud-feature-icon">{CheckIcon}</span>
              <span>One account works on every device you install kanbots on</span>
            </li>
          </ul>

          <div className="kb-cloud-cta-row">
            <button
              type="button"
              className="kb-cloud-cta"
              onClick={() => setShowSettings(true)}
              disabled={busy}
            >
              Sign in to Kanbots Cloud
            </button>
            {/* Cloud-only launch: "Continue local-only" CTA removed */}
          </div>

          <p className="kb-cloud-fineprint">
            By continuing you agree to our{' '}
            <a href="https://app.kanbots.dev/terms" target="_blank" rel="noopener noreferrer">
              Terms
            </a>{' '}
            and{' '}
            <a href="https://app.kanbots.dev/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
