import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent } from 'react';
import { api } from '../../api.js';
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
  /** True if credentials come from OAuth (Claude Code), not an API key. */
  oauth?: boolean;
  signupUrl?: string;
}

const SPECS: ProviderSpec[] = [
  {
    id: 'claude-code',
    name: 'Claude Code subscription',
    description: 'Use your Claude Code account session. Best for agentic runs.',
    oauth: true,
    signupUrl: 'https://claude.com/claude-code',
  },
  {
    id: 'anthropic',
    name: 'Anthropic API',
    description: 'Direct Messages API. Use a key from console.anthropic.com.',
    signupUrl: 'https://console.anthropic.com/',
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    description: 'Use a key from platform.openai.com.',
    signupUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    description: 'Use a key from aistudio.google.com.',
    signupUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Use a key from platform.deepseek.com.',
    signupUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    description: 'Use a key from console.x.ai.',
    signupUrl: 'https://console.x.ai/',
  },
];

// Mirror @kanbots/llm catalogue. Keep in sync.
const MODELS_BY_PROVIDER: Record<ProviderId, Array<{ id: string; label: string }>> = {
  'claude-code': [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  anthropic: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
  ],
  google: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  ],
  xai: [
    { id: 'grok-4', label: 'Grok 4' },
    { id: 'grok-4-mini', label: 'Grok 4 mini' },
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
      <div className="kb-modal kb-providers" onMouseDown={stopInner}>
        <div className="kb-modal-head">
          <h2>AI providers</h2>
          <button type="button" className="kb-icon-btn" onClick={onClose} aria-label="Close" title="Close">
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
              {!payload.safeStorageAvailable ? (
                <div className="kb-sentry-warn" role="status">
                  No system keyring detected — keys will be stored unencrypted on disk.
                </div>
              ) : null}

              {!payload.anyConfigured ? (
                <div className="kb-sentry-warn" role="status">
                  <strong>No providers configured.</strong> Enable at least one provider below
                  to dispatch agent runs.
                </div>
              ) : null}

              <div className="kb-providers-defaults">
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

interface SectionProps {
  spec: ProviderSpec;
  config: ProviderConfigPayload;
  onChanged: (next: ProvidersPayload) => void;
}

function ProviderSection({ spec, config, onChanged }: SectionProps) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [keyDraft, setKeyDraft] = useState('');
  const [defaultModel, setDefaultModel] = useState(config.defaultModel ?? '');
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(config.enabled);
    setDefaultModel(config.defaultModel ?? '');
  }, [config.enabled, config.defaultModel]);

  const dirty = useMemo(() => {
    if (enabled !== config.enabled) return true;
    if (keyDraft.length > 0) return true;
    if ((defaultModel || null) !== (config.defaultModel ?? null)) return true;
    return false;
  }, [enabled, keyDraft, defaultModel, config]);

  async function handleSave(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setLocalError(null);
    try {
      const input: import('../../types.js').ProviderSaveInput = {
        id: spec.id,
        enabled,
        defaultModel: defaultModel.trim() || null,
      };
      if (!spec.oauth && keyDraft.length > 0) {
        input.apiKey = keyDraft;
      }
      const next = await api.saveProvider(input);
      onChanged(next);
      setKeyDraft('');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleClearKey(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setLocalError(null);
    try {
      const next = await api.saveProvider({ id: spec.id, apiKey: null });
      onChanged(next);
      setKeyDraft('');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTestState({ kind: 'running' });
    try {
      const args: { id: ProviderId; apiKey?: string } = { id: spec.id };
      if (!spec.oauth && keyDraft.length > 0) args.apiKey = keyDraft;
      const result: ProviderTestConnectionResult = await api.testProviderConnection(args);
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

  const models = MODELS_BY_PROVIDER[spec.id] ?? [];

  return (
    <fieldset className="kb-provider-section">
      <legend className="kb-provider-legend">
        <strong>{spec.name}</strong>
        {config.hasKey ? <span className="kb-provider-badge">configured</span> : null}
      </legend>
      <p className="kb-provider-desc">{spec.description}</p>

      <label className="kb-sentry-row kb-sentry-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEnabled(e.target.checked)}
        />
        <span>Enabled</span>
      </label>

      {spec.oauth ? (
        <div className="kb-sentry-row">
          {config.hasKey ? (
            <span>✓ Signed in to Claude Code.</span>
          ) : (
            <span>
              Sign in via the desktop app (the kanban gate launches the OAuth flow).{' '}
              <a href={spec.signupUrl} target="_blank" rel="noopener noreferrer">
                Learn more
              </a>
            </span>
          )}
        </div>
      ) : (
        <>
          <label className="kb-sentry-row">
            <span className="kb-sentry-label">API key</span>
            <input
              type="password"
              value={keyDraft}
              placeholder={config.hasKey ? '•••••• (leave blank to keep)' : 'Paste API key'}
              autoComplete="off"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setKeyDraft(e.target.value)}
            />
          </label>
          {spec.signupUrl ? (
            <div className="kb-sentry-hint">
              Get a key:{' '}
              <a href={spec.signupUrl} target="_blank" rel="noopener noreferrer">
                {spec.signupUrl}
              </a>
            </div>
          ) : null}
        </>
      )}

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

      <div className="kb-sentry-actions">
        <button
          type="button"
          className="kb-btn ghost"
          disabled={testState.kind === 'running'}
          onClick={() => void handleTest()}
        >
          {testState.kind === 'running' ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="button"
          className="kb-btn"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!spec.oauth && config.hasKey ? (
          <button
            type="button"
            className="kb-btn ghost"
            disabled={saving}
            onClick={() => void handleClearKey()}
          >
            Clear key
          </button>
        ) : null}
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
    </fieldset>
  );
}
