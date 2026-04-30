import { useState } from 'react';
import { ProvidersSettingsModal } from '../components/modals/ProvidersSettingsModal.js';
import { getBridge } from '../desktop-bridge.js';

export interface ProvidersOverlayProps {
  reason: 'none' | 'all-failed';
  /** Called when sign-in/setup completes — caller should refetch provider status. */
  onConfigured: () => void;
}

/**
 * Non-dismissible overlay shown when no AI provider is configured (or all
 * configured providers failed validation on startup). Spec: high-contrast
 * warning, primary CTA → Settings → Providers; sidebar/composer/dispatch
 * remain disabled until at least one provider is configured.
 */
export function ProvidersOverlay({ reason, onConfigured }: ProvidersOverlayProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithClaude(): Promise<void> {
    const bridge = getBridge();
    if (!bridge) {
      setError('Desktop bridge not available — open the desktop app instead.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await bridge.claudeLoginStart();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onConfigured();
  }

  return (
    <>
      <div
        className="kb-providers-overlay"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="providers-overlay-title"
      >
        <div className="kb-providers-overlay-card">
          <div className="kb-providers-overlay-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 22h20L12 2z" />
              <path d="M12 9v6M12 18v.01" />
            </svg>
          </div>
          <h1 id="providers-overlay-title" className="kb-providers-overlay-title">
            {reason === 'all-failed'
              ? 'AI provider authentication failed'
              : 'Kanbots needs an AI provider to work'}
          </h1>
          <p className="kb-providers-overlay-body">
            {reason === 'all-failed'
              ? 'Every configured provider failed validation. Open settings to update keys or sign in again.'
              : 'Sign in with your Claude Code subscription, or paste an API key for Anthropic, OpenAI, Gemini, DeepSeek, or Grok to continue.'}
          </p>
          <div className="kb-providers-overlay-actions">
            <button
              type="button"
              className="kb-btn primary"
              onClick={() => void signInWithClaude()}
              disabled={busy}
            >
              {busy ? 'Waiting for browser…' : 'Sign in with Claude Code'}
            </button>
            <button
              type="button"
              className="kb-btn ghost"
              onClick={() => setSettingsOpen(true)}
            >
              Use an API key
            </button>
          </div>
          {error ? (
            <div className="kb-sentry-error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </div>
      {settingsOpen ? (
        <ProvidersSettingsModal
          onClose={() => {
            setSettingsOpen(false);
            onConfigured();
          }}
        />
      ) : null}
    </>
  );
}
