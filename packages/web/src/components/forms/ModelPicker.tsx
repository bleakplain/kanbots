import { useEffect, useMemo } from 'react';
import { api } from '../../api.js';
import { useFetch } from '../../hooks/useFetch.js';
import type { ProviderId } from '../../types.js';

interface ModelEntry {
  id: string;
  label: string;
}

// Mirror @kanbots/llm catalogue. Keep in sync.
const MODELS: Record<ProviderId, ModelEntry[]> = {
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

const PROVIDER_LABELS: Record<ProviderId, string> = {
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
};

export interface ModelPickerValue {
  provider: ProviderId;
  model: string;
}

export interface ModelPickerProps {
  value: ModelPickerValue | null;
  onChange: (next: ModelPickerValue) => void;
  className?: string;
  /**
   * If true, only providers that support agent runs are shown. Both
   * `claude-code` and `codex-cli` qualify, so this is currently a no-op
   * filter — kept on the API for parity with chat-only futures.
   */
  agentRunsOnly?: boolean;
}

export function ModelPicker({ value, onChange, className, agentRunsOnly }: ModelPickerProps) {
  const { data: providers } = useFetch('providers', () => api.getProviders());

  const options = useMemo(() => {
    if (!providers) return [] as Array<{ provider: ProviderId; models: ModelEntry[] }>;
    return providers.providers
      .filter((p) => p.enabled && p.hasKey)
      .filter((p) => (agentRunsOnly ? p.id === 'claude-code' || p.id === 'codex-cli' : true))
      .map((p) => ({ provider: p.id, models: MODELS[p.id] ?? [] }));
  }, [providers, agentRunsOnly]);

  // Auto-select first option if value is unset and options become available.
  useEffect(() => {
    if (value || options.length === 0) return;
    const first = options[0];
    if (!first || first.models.length === 0) return;
    const firstModel = first.models[0];
    if (firstModel) {
      onChange({ provider: first.provider, model: firstModel.id });
    }
  }, [value, options, onChange]);

  const selectedKey = value ? `${value.provider}:${value.model}` : '';

  return (
    <select
      className={className}
      value={selectedKey}
      onChange={(e) => {
        const [provider, model] = e.target.value.split(':') as [ProviderId, string];
        if (provider && model) onChange({ provider, model });
      }}
    >
      {options.length === 0 ? <option value="">(no providers configured)</option> : null}
      {options.map(({ provider, models }) => (
        <optgroup key={provider} label={PROVIDER_LABELS[provider]}>
          {models.map((m) => (
            <option key={`${provider}:${m.id}`} value={`${provider}:${m.id}`}>
              {m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
