import type { ModelEntry, ProviderId } from './types.js';

/**
 * Static model catalogue shipped with the app. Update when providers ship new
 * flagship models. The Settings UI reads this to populate per-provider model
 * dropdowns; the model picker reads it to render grouped options.
 */
export const MODELS: ModelEntry[] = [
  // Anthropic / Claude Code subscription
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
  // Anthropic API
  {
    provider: 'anthropic',
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    contextWindow: 1_000_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'anthropic',
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  {
    provider: 'anthropic',
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    contextWindow: 200_000,
    toolUse: true,
  },
  // OpenAI
  {
    provider: 'openai',
    id: 'gpt-5',
    label: 'GPT-5',
    contextWindow: 400_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'openai',
    id: 'gpt-5-mini',
    label: 'GPT-5 mini',
    contextWindow: 400_000,
    toolUse: true,
  },
  {
    provider: 'openai',
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  // Google Gemini
  {
    provider: 'google',
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    contextWindow: 2_000_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'google',
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    contextWindow: 1_000_000,
    toolUse: true,
  },
  // DeepSeek
  {
    provider: 'deepseek',
    id: 'deepseek-chat',
    label: 'DeepSeek Chat',
    contextWindow: 128_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'deepseek',
    id: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    contextWindow: 128_000,
    toolUse: true,
  },
  // xAI Grok
  {
    provider: 'xai',
    id: 'grok-4',
    label: 'Grok 4',
    contextWindow: 256_000,
    toolUse: true,
    recommended: true,
  },
  {
    provider: 'xai',
    id: 'grok-4-mini',
    label: 'Grok 4 mini',
    contextWindow: 256_000,
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
