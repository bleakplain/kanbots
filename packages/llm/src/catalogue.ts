import type { ModelEntry, ProviderId } from './types.js';

/**
 * Static model catalogue shipped with the app. Update when providers ship new
 * flagship models. The Settings UI reads this to populate per-provider model
 * dropdowns; the model picker reads it to render grouped options.
 */
export const MODELS: ModelEntry[] = [
  // Claude Code subscription
  {
    provider: 'claude-code',
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    contextWindow: 1_000_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'claude-code',
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'claude-code',
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    contextWindow: 200_000,
    toolUse: true,
  },
  // Codex CLI (OpenAI agentic CLI)
  {
    provider: 'codex-cli',
    id: 'gpt-5',
    label: 'GPT-5',
    contextWindow: 400_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'codex-cli',
    id: 'gpt-5-mini',
    label: 'GPT-5 mini',
    contextWindow: 400_000,
    toolUse: true,
  },
];

export function modelsForProvider(provider: ProviderId): ModelEntry[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function recommendedModel(provider: ProviderId): ModelEntry | null {
  return (
    MODELS.find((m) => m.provider === provider && m.recommended) ??
    MODELS.find((m) => m.provider === provider) ??
    null
  );
}

export function findModel(provider: ProviderId, id: string): ModelEntry | null {
  return MODELS.find((m) => m.provider === provider && m.id === id) ?? null;
}
