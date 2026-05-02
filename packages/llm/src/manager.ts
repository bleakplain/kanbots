import { claudeCodeAdapter } from './adapters/claude-code.js';
import { codexCliAdapter } from './adapters/codex-cli.js';
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
  'codex-cli': codexCliAdapter,
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
