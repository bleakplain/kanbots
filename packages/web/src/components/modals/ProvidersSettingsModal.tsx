import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from 'react';
import { api } from '../../api.js';
import { getBridge } from '../../desktop-bridge.js';
import type {
  ProviderConfigPayload,
  ProviderId,
  ProviderTestConnectionResult,
  ProvidersPayload,
} from '../../types.js';

export interface ProvidersSettingsModalProps {
  onClose: () => void;
}

interface ProviderSpec {
  id: ProviderId;
  name: string;
  description: string;
  /** Auth is handled outside the app — Claude Code OAuth or `codex login`. */
  externalAuth: true;
  signupUrl: string;
  /** Label for the in-app sign-in button. */
  signInLabel: string;
  /** Fallback hint shown alongside the sign-in button. */
  authHint: string;
}

const SPECS: ProviderSpec[] = [
  {
    id: 'claude-code',
    name: 'Claude Code subscription',
    description: 'Use your Claude Code account session. Best for agentic runs.',
    externalAuth: true,
    signupUrl: 'https://claude.com/claude-code',
    signInLabel: 'Sign in with Claude Code',
    authHint: 'Opens claude.com in your browser to complete OAuth.',
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI (OpenAI)',
    description:
      'Run agent tasks through OpenAI’s codex CLI. Requires `codex` on PATH. Issue drafting and Sentry analysis still run on Claude.',
    externalAuth: true,
    signupUrl: 'https://github.com/openai/codex',
    signInLabel: 'Sign in with codex',
    authHint:
      'Spawns `codex login` and opens auth.openai.com in your browser. You can also set OPENAI_API_KEY in your environment.',
  },
];

// Mirror @kanbots/llm catalogue. Keep in sync.
const MODELS_BY_PROVIDER: Record<ProviderId, Array<{ id: string; label: string }>> = {
  'claude-code': [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  'codex-cli': [
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  ],
};

export function ProvidersSettingsModal({ onClose }: ProvidersSettingsModalProps) {
  const [payload, setPayload] = useState<ProvidersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setPayload(await api.getProviders());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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

  async function handleSetDefaults(input: { defaultProvider?: ProviderId | null; defaultModel?: string | null }): Promise<void> {
    try {
      const next = await api.setProviderDefaults(input);
      setPayload(next);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  const configuredProviders = useMemo(
    () => (payload?.providers ?? []).filter((p) => p.enabled && p.hasKey),
    [payload],
  );

  return (
    <div className="kb-modal-scrim" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="kb-modal kb-modal-providers sm" onMouseDown={stopInner}>
        <div className="kb-modal-head">
          <h2>AI providers</h2>
          <span className="grow" />
          <button type="button" className="x-btn" onClick={onClose} aria-label="Close" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="kb-modal-body kb-providers-body">
          {loading ? <div>Loading…</div> : null}
          {error ? (
            <div className="kb-sentry-error" role="alert">
              {error.message}
            </div>
          ) : null}

          {payload ? (
            <>
              {!payload.anyConfigured ? (
                <div className="kb-sentry-warn" role="status">
                  <strong>No providers configured.</strong> Sign in to Claude Code or run
                  {' '}<code>codex login</code> to enable agent runs.
                </div>
              ) : null}

              <div className="kb-providers-defaults">
                <div className="kb-providers-defaults-title">Defaults</div>
                <label className="kb-sentry-row">
                  <span className="kb-sentry-label">Default provider</span>
                  <select
                    value={payload.settings.defaultProvider ?? ''}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      void handleSetDefaults({
                        defaultProvider: (e.target.value || null) as ProviderId | null,
                      })
                    }
                  >
                    <option value="">(none)</option>
                    {configuredProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {SPECS.find((s) => s.id === p.id)?.name ?? p.id}
                      </option>
                    ))}
                  </select>
                </label>
                {payload.settings.defaultProvider ? (
                  <label className="kb-sentry-row">
                    <span className="kb-sentry-label">Default model</span>
                    <select
                      value={payload.settings.defaultModel ?? ''}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        void handleSetDefaults({ defaultModel: e.target.value || null })
                      }
                    >
                      <option value="">(provider default)</option>
                      {(MODELS_BY_PROVIDER[payload.settings.defaultProvider] ?? []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="kb-providers-list">
                {SPECS.map((spec) => {
                  const cfg = payload.providers.find((p) => p.id === spec.id);
                  if (!cfg) return null;
                  return (
                    <ProviderSection
                      key={spec.id}
                      spec={spec}
                      config={cfg}
                      onChanged={(next) => setPayload(next)}
                    />
                  );
                })}
              </div>
            </>
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

type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; models?: string[] }
  | { kind: 'error'; message: string };

type LoginState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'error'; message: string };

interface SectionProps {
  spec: ProviderSpec;
  config: ProviderConfigPayload;
  onChanged: (next: ProvidersPayload) => void;
}

function ProviderSection({ spec, config, onChanged }: SectionProps) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [defaultModel, setDefaultModel] = useState(config.defaultModel ?? '');
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [loginState, setLoginState] = useState<LoginState>({ kind: 'idle' });
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(config.enabled);
    setDefaultModel(config.defaultModel ?? '');
  }, [config.enabled, config.defaultModel]);

  const dirty = useMemo(() => {
    if (enabled !== config.enabled) return true;
    if ((defaultModel || null) !== (config.defaultModel ?? null)) return true;
    return false;
  }, [enabled, defaultModel, config]);

  async function handleSave(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setLocalError(null);
    try {
      const next = await api.saveProvider({
        id: spec.id,
        enabled,
        defaultModel: defaultModel.trim() || null,
      });
      onChanged(next);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTestState({ kind: 'running' });
    try {
      const result: ProviderTestConnectionResult = await api.testProviderConnection({ id: spec.id });
      if (result.ok) {
        const out: TestState = { kind: 'ok' };
        if (result.models !== undefined) out.models = result.models;
        setTestState(out);
      } else {
        setTestState({ kind: 'error', message: result.error ?? 'unknown error' });
      }
    } catch (err) {
      setTestState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleSignIn(): Promise<void> {
    const bridge = getBridge();
    if (!bridge) {
      setLoginState({
        kind: 'error',
        message: 'Desktop bridge unavailable — open the desktop app to sign in.',
      });
      return;
    }
    setLoginState({ kind: 'running' });
    try {
      const result =
        spec.id === 'claude-code'
          ? await bridge.claudeLoginStart()
          : await bridge.codexLoginStart();
      if (!result.ok) {
        setLoginState({ kind: 'error', message: result.error });
        return;
      }
      // Refresh the providers payload so `hasKey` flips to true and the
      // section swaps to the "configured" state.
      const next = await api.getProviders();
      onChanged(next);
      setLoginState({ kind: 'idle' });
    } catch (err) {
      setLoginState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleCancelSignIn(): void {
    const bridge = getBridge();
    if (!bridge) return;
    if (spec.id === 'claude-code') {
      void bridge.claudeLoginCancel();
    } else {
      void bridge.codexLoginCancel();
    }
  }

  const models = MODELS_BY_PROVIDER[spec.id] ?? [];
  const signedInLabel =
    spec.id === 'claude-code' ? '✓ Signed in to Claude Code.' : '✓ codex credentials detected.';

  return (
    <section className="kb-provider-section">
      <header className="kb-provider-header">
        <strong>{spec.name}</strong>
        {config.hasKey ? <span className="kb-provider-badge">configured</span> : null}
      </header>
      <p className="kb-provider-desc">{spec.description}</p>

      <label className="kb-sentry-row kb-sentry-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEnabled(e.target.checked)}
        />
        <span>Enabled</span>
      </label>

      <div className="kb-sentry-row">
        {config.hasKey ? (
          <span>{signedInLabel}</span>
        ) : (
          <span>
            {spec.authHint}{' '}
            <a href={spec.signupUrl} target="_blank" rel="noopener noreferrer">
              Learn more
            </a>
          </span>
        )}
      </div>

      {!config.hasKey ? (
        <div className="kb-provider-actions">
          <button
            type="button"
            className="kb-btn primary"
            onClick={() => void handleSignIn()}
            disabled={loginState.kind === 'running'}
          >
            {loginState.kind === 'running' ? 'Waiting for browser…' : spec.signInLabel}
          </button>
          {loginState.kind === 'running' ? (
            <button type="button" className="kb-btn ghost" onClick={handleCancelSignIn}>
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
      {loginState.kind === 'error' ? (
        <div className="kb-sentry-error">{loginState.message}</div>
      ) : null}

      <label className="kb-sentry-row">
        <span className="kb-sentry-label">Default model</span>
        <select
          value={defaultModel}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setDefaultModel(e.target.value)}
        >
          <option value="">(none)</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <div className="kb-provider-actions">
        <button
          type="button"
          className="kb-btn"
          disabled={testState.kind === 'running'}
          onClick={() => void handleTest()}
        >
          {testState.kind === 'running' ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="button"
          className="kb-btn primary"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {testState.kind === 'ok' ? (
        <div className="kb-sentry-ok">
          ✓ Connection ok{testState.models && testState.models.length > 0 ? ` — ${testState.models.length} models available` : ''}.
        </div>
      ) : null}
      {testState.kind === 'error' ? (
        <div className="kb-sentry-error">{testState.message}</div>
      ) : null}
      {localError ? <div className="kb-sentry-error">{localError}</div> : null}
      {config.lastError ? (
        <div className="kb-sentry-error">Last error: {config.lastError}</div>
      ) : null}
    </section>
  );
}
