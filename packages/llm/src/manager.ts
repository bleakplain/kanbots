import { anthropicAdapter } from './adapters/anthropic.js';
import { claudeCodeAdapter } from './adapters/claude-code.js';
import { googleAdapter } from './adapters/google.js';
import {
  deepseekAdapter,
  openaiAdapter,
  xaiAdapter,
} from './adapters/openai-compatible.js';
import type {
  ChatRequest,
  ChatResponse,
  ProviderAdapter,
  ProviderCredentials,
  ProviderId,
  ValidateResult,
} from './types.js';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  'claude-code': claudeCodeAdapter,
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  deepseek: deepseekAdapter,
  xai: xaiAdapter,
};

export function getAdapter(id: ProviderId): ProviderAdapter {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`unknown provider: ${id}`);
  return adapter;
}

export function listAdapters(): ProviderAdapter[] {
  return Object.values(ADAPTERS);
}

export async function validateProvider(
  id: ProviderId,
  creds: ProviderCredentials,
): Promise<ValidateResult> {
  return getAdapter(id).validate(creds);
}

export async function chat(
  id: ProviderId,
  req: ChatRequest,
  creds: ProviderCredentials,
): Promise<ChatResponse> {
  return getAdapter(id).chat(req, creds);
}
