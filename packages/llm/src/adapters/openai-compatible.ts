import type {
  ChatRequest,
  ChatResponse,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderCredentials,
  ProviderId,
  ValidateResult,
} from '../types.js';

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string };
}

interface OpenAIModelsResponse {
  data?: Array<{ id?: string }>;
  error?: { message?: string };
}

interface OpenAICompatibleConfig {
  id: ProviderId;
  baseUrl: string;
  capabilities: ProviderCapabilities;
}

/**
 * Build an adapter for an OpenAI-compatible HTTP API. Used for OpenAI itself,
 * DeepSeek (https://api.deepseek.com), and xAI Grok (https://api.x.ai/v1).
 */
export function buildOpenAICompatibleAdapter(cfg: OpenAICompatibleConfig): ProviderAdapter {
  return {
    id: cfg.id,
    capabilities: cfg.capabilities,

    async validate(creds: ProviderCredentials): Promise<ValidateResult> {
      if (creds.kind !== 'api-key') return { ok: false, error: 'expected api-key credentials' };
      try {
        const res = await fetch(`${cfg.baseUrl}/models`, {
          method: 'GET',
          headers: { authorization: `Bearer ${creds.apiKey}` },
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          return { ok: false, error: `${res.status} ${res.statusText}${txt ? `: ${txt.slice(0, 200)}` : ''}` };
        }
        const body = (await res.json().catch(() => ({}))) as OpenAIModelsResponse;
        const models = body.data?.map((m) => m.id ?? '').filter(Boolean) ?? [];
        return { ok: true, models };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async chat(req: ChatRequest, creds: ProviderCredentials): Promise<ChatResponse> {
      if (creds.kind !== 'api-key') throw new Error(`${cfg.id} adapter requires api-key credentials`);
      const messages: Array<{ role: string; content: string }> = [];
      if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });
      for (const m of req.messages) messages.push({ role: m.role, content: m.content });
      const body = {
        model: req.model,
        messages,
        ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      };
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${creds.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        ...(req.abortSignal ? { signal: req.abortSignal } : {}),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`${cfg.id} API error ${res.status}: ${txt.slice(0, 500)}`);
      }
      const json = (await res.json()) as OpenAIChatResponse;
      if (json.error) throw new Error(`${cfg.id} API error: ${json.error.message ?? 'unknown'}`);
      const text = json.choices?.[0]?.message?.content ?? '';
      const tokenUsage =
        json.usage && typeof json.usage.prompt_tokens === 'number' && typeof json.usage.completion_tokens === 'number'
          ? { input: json.usage.prompt_tokens, output: json.usage.completion_tokens }
          : null;
      return { text, tokenUsage };
    },
  };
}

export const openaiAdapter: ProviderAdapter = buildOpenAICompatibleAdapter({
  id: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  capabilities: {
    streaming: true,
    toolUse: true,
    parallelToolCalls: true,
    imageInput: true,
    resumeBySessionId: false,
    agentRuns: false,
  },
});

export const deepseekAdapter: ProviderAdapter = buildOpenAICompatibleAdapter({
  id: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  capabilities: {
    streaming: true,
    toolUse: true,
    parallelToolCalls: false,
    imageInput: false,
    resumeBySessionId: false,
    agentRuns: false,
  },
});

export const xaiAdapter: ProviderAdapter = buildOpenAICompatibleAdapter({
  id: 'xai',
  baseUrl: 'https://api.x.ai/v1',
  capabilities: {
    streaming: true,
    toolUse: true,
    parallelToolCalls: true,
    imageInput: true,
    resumeBySessionId: false,
    agentRuns: false,
  },
});
