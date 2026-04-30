import type {
  ChatRequest,
  ChatResponse,
  ProviderAdapter,
  ProviderCredentials,
  ValidateResult,
} from '../types.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

/**
 * Anthropic Messages API adapter (chat-only in v1). Uses plain `fetch` to keep
 * the package SDK-free; if we adopt @anthropic-ai/sdk later, swap the body.
 */
export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  capabilities: {
    streaming: true,
    toolUse: true,
    parallelToolCalls: true,
    imageInput: true,
    resumeBySessionId: false,
    agentRuns: false,
  },

  async validate(creds: ProviderCredentials): Promise<ValidateResult> {
    if (creds.kind !== 'api-key') return { ok: false, error: 'expected api-key credentials' };
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': creds.apiKey,
          'anthropic-version': API_VERSION,
        },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, error: `${res.status} ${res.statusText}${txt ? `: ${txt.slice(0, 200)}` : ''}` };
      }
      const body = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> };
      const models = body.data?.map((m) => m.id ?? '').filter(Boolean) ?? [];
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async chat(req: ChatRequest, creds: ProviderCredentials): Promise<ChatResponse> {
    if (creds.kind !== 'api-key') throw new Error('anthropic adapter requires api-key credentials');
    const body = {
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
      messages: req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': creds.apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(req.abortSignal ? { signal: req.abortSignal } : {}),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${txt.slice(0, 500)}`);
    }
    const json = (await res.json()) as AnthropicMessageResponse;
    if (json.error) {
      throw new Error(`Anthropic API error: ${json.error.type ?? 'unknown'}: ${json.error.message ?? ''}`);
    }
    const text = (json.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text!)
      .join('');
    const tokenUsage =
      json.usage && typeof json.usage.input_tokens === 'number' && typeof json.usage.output_tokens === 'number'
        ? { input: json.usage.input_tokens, output: json.usage.output_tokens }
        : null;
    return { text, tokenUsage };
  },
};
