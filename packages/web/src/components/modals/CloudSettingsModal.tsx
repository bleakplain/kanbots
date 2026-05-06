import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { getBridge } from '../../desktop-bridge.js';
import type { CloudStatusPayload } from '../../desktop-bridge.js';

export interface CloudSettingsModalProps {
  onClose: () => void;
  onChanged?: (status: CloudStatusPayload) => void;
}

type LoginState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | {
      kind: 'awaiting';
      userCode: string;
      verificationUri: string;
      verificationUriComplete: string;
      expiresAt: number;
      intervalMs: number;
    }
  | { kind: 'error'; message: string };

const DEFAULT_BASE_URL = 'https://app.kanbots.dev';

export function CloudSettingsModal({ onClose, onChanged }: CloudSettingsModalProps) {
  const [status, setStatus] = useState<CloudStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [login, setLogin] = useState<LoginState>({ kind: 'idle' });
  const [signingOut, setSigningOut] = useState(false);
  const pollHandle = useRef<number | null>(null);

  function clearPoll(): void {
    if (pollHandle.current !== null) {
      window.clearTimeout(pollHandle.current);
      pollHandle.current = null;
    }
  }

  const refresh = useCallback(async (): Promise<CloudStatusPayload | null> => {
    const bridge = getBridge();
    if (!bridge) {
      setLoadError('Desktop bridge unavailable.');
      setLoading(false);
      return null;
    }
    try {
      const next = await bridge.cloudAuthStatus();
      setStatus(next);
      setLoadError(null);
      onChanged?.(next);
      return next;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [onChanged]);

  useEffect(() => {
    void refresh();
    return () => {
      clearPoll();
    };
  }, [refresh]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  const schedulePoll = useCallback(
    (intervalMs: number) => {
      clearPoll();
      pollHandle.current = window.setTimeout(async () => {
        const bridge = getBridge();
        if (!bridge) return;
        try {
          const result = await bridge.cloudLoginPoll();
          if (result.status === 'pending') {
            schedulePoll(intervalMs);
            return;
          }
          if (result.status === 'approved') {
            setLogin({ kind: 'idle' });
            await refresh();
            return;
          }
          if (result.status === 'idle') {
            setLogin({ kind: 'idle' });
            return;
          }
          if (result.status === 'error') {
            setLogin({ kind: 'error', message: result.error });
            return;
          }
          // expired / consumed / cancelled
          setLogin({
            kind: 'error',
            message:
              result.status === 'expired'
                ? 'Code expired. Try signing in again.'
                : result.status === 'consumed'
                  ? 'This sign-in code was already used.'
                  : 'Sign-in cancelled.',
          });
        } catch (err) {
          setLogin({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }, intervalMs);
    },
    [refresh],
  );

  async function handleSignIn(): Promise<void> {
    const bridge = getBridge();
    if (!bridge) {
      setLogin({ kind: 'error', message: 'Desktop bridge unavailable.' });
      return;
    }
    setLogin({ kind: 'starting' });
    try {
      const result = await bridge.cloudLoginStart();
      if (!result.ok) {
        setLogin({ kind: 'error', message: result.error });
        return;
      }
      setLogin({
        kind: 'awaiting',
        userCode: result.userCode,
        verificationUri: result.verificationUri,
        verificationUriComplete: result.verificationUriComplete,
        expiresAt: result.expiresAt,
        intervalMs: result.intervalMs,
      });
      schedulePoll(result.intervalMs);
    } catch (err) {
      setLogin({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleCancelSignIn(): Promise<void> {
    clearPoll();
    const bridge = getBridge();
    if (bridge) await bridge.cloudLoginCancel();
    setLogin({ kind: 'idle' });
  }

  async function handleSignOut(): Promise<void> {
    if (signingOut) return;
    if (!window.confirm('Sign out of Kanbots Cloud on this device?')) return;
    const bridge = getBridge();
    if (!bridge) return;
    setSigningOut(true);
    try {
      await bridge.cloudLogout();
      await refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="kb-modal-scrim" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="kb-modal sm" onMouseDown={stopInner}>
        <div className="kb-modal-head">
          <h2>Kanbots Cloud</h2>
          <span className="grow" />
          <button
            type="button"
            className="x-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="kb-modal-body">
          {loading ? <div>Loading…</div> : null}
          {loadError ? (
            <div className="kb-sentry-error" role="alert">
              {loadError}
            </div>
          ) : null}

          {status && !loading ? (
            status.authed ? (
              <SignedInView
                status={status}
                signingOut={signingOut}
                onSignOut={() => void handleSignOut()}
              />
            ) : (
              <SignedOutView
                login={login}
                onSignIn={() => void handleSignIn()}
                onCancelSignIn={() => void handleCancelSignIn()}
              />
            )
          ) : null}
        </div>

        <div className="kb-modal-foot">
          <span className="hint" />
          <button type="button" className="kb-btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SignedInView({
  status,
  signingOut,
  onSignOut,
}: {
  status: CloudStatusPayload;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  return (
    <>
      <div className="kb-sentry-ok">
        ✓ Connected to Kanbots Cloud{status.orgId ? ` (org ${status.orgId})` : ''}.
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>
        Tasks and runs sync to the cloud. Sign out to keep this workspace local-only;
        local data stays on this device either way.
      </p>
      <dl className="kb-cloud-meta" style={{ display: 'grid', gap: 6, fontSize: 12 }}>
        {status.baseUrl ? (
          <div>
            <span style={{ color: 'var(--ink-3)' }}>Endpoint: </span>
            <code>{status.baseUrl}</code>
          </div>
        ) : null}
        {status.tokenPrefix ? (
          <div>
            <span style={{ color: 'var(--ink-3)' }}>Token: </span>
            <code>{status.tokenPrefix}…</code>
          </div>
        ) : null}
        {status.signedInAt ? (
          <div>
            <span style={{ color: 'var(--ink-3)' }}>Signed in: </span>
            <span>{new Date(status.signedInAt).toLocaleString()}</span>
          </div>
        ) : null}
      </dl>
      <div className="kb-provider-actions" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="kb-btn"
          onClick={onSignOut}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </>
  );
}

function SignedOutView({
  login,
  onSignIn,
  onCancelSignIn,
}: {
  login: LoginState;
  onSignIn: () => void;
  onCancelSignIn: () => void;
}) {
  return (
    <>
      <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>
        Sign in to your Kanbots Cloud account to sync tasks across devices and your team.
        Without a cloud account this app stays fully local — nothing leaves your machine.
      </p>

      {login.kind === 'idle' || login.kind === 'starting' ? (
        <div className="kb-provider-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="kb-btn primary"
            onClick={onSignIn}
            disabled={login.kind === 'starting'}
          >
            {login.kind === 'starting' ? 'Opening browser…' : 'Sign in to Kanbots Cloud'}
          </button>
          <a
            href={DEFAULT_BASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="kb-btn ghost"
          >
            Create account
          </a>
        </div>
      ) : null}

      {login.kind === 'awaiting' ? (
        <div
          className="kb-cloud-awaiting"
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            border: '1px solid var(--hairline-soft)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Waiting for browser approval. If the page didn't open, visit{' '}
            <a
              href={login.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
            >
              {login.verificationUri}
            </a>{' '}
            and enter:
          </div>
          <div
            style={{
              fontFamily: 'var(--mono, ui-monospace)',
              fontSize: 22,
              letterSpacing: '0.18em',
              padding: '10px 14px',
              background: 'var(--surface-2, rgba(0,0,0,0.04))',
              borderRadius: 6,
              textAlign: 'center',
              userSelect: 'all',
            }}
          >
            {login.userCode}
          </div>
          <div className="kb-provider-actions">
            <a
              href={login.verificationUriComplete}
              target="_blank"
              rel="noopener noreferrer"
              className="kb-btn primary"
            >
              Open browser
            </a>
            <button type="button" className="kb-btn ghost" onClick={onCancelSignIn}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {login.kind === 'error' ? (
        <>
          <div className="kb-sentry-error" style={{ marginTop: 12 }}>
            {login.message}
          </div>
          <div className="kb-provider-actions" style={{ marginTop: 12 }}>
            <button type="button" className="kb-btn primary" onClick={onSignIn}>
              Try again
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
