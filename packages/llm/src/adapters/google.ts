import type {
  ChatRequest,
  ChatResponse,
  ProviderAdapter,
  ProviderCredentials,
  ValidateResult,
} from '../types.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; status?: string };
}

interface GeminiModelsResponse {
  models?: Array<{ name?: string }>;
  error?: { message?: string };
}

/**
 * Google Gemini adapter (chat-only in v1) using the v1beta REST API.
 * Authentication is via `?key=API_KEY` query param.
 */
export const googleAdapter: ProviderAdapter = {
  id: 'google',
  capabilities: {
    streaming: true,
    toolUse: true,
    parallelToolCalls: false,
    imageInput: true,
    resumeBySessionId: false,
    agentRuns: false,
  },

  async validate(creds: ProviderCredentials): Promise<ValidateResult> {
    if (creds.kind !== 'api-key') return { ok: false, error: 'expected api-key credentials' };
    try {
      const res = await fetch(`${BASE_URL}/models?key=${encodeURIComponent(creds.apiKey)}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, error: `${res.status} ${res.statusText}${txt ? `: ${txt.slice(0, 200)}` : ''}` };
      }
      const body = (await res.json().catch(() => ({}))) as GeminiModelsResponse;
      const models =
        body.models?.map((m) => m.name?.replace(/^models\//, '') ?? '').filter(Boolean) ?? [];
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async chat(req: ChatRequest, creds: ProviderCredentials): Promise<ChatResponse> {
    if (creds.kind !== 'api-key') throw new Error('google adapter requires api-key credentials');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const body = {
      contents,
      ...(req.systemPrompt
        ? { systemInstruction: { parts: [{ text: req.systemPrompt }] } }
        : {}),
      generationConfig: {
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      },
    };
    const url = `${BASE_URL}/models/${encodeURIComponent(req.model)}:generateContent?key=${encodeURIComponent(creds.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(req.abortSignal ? { signal: req.abortSignal } : {}),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Google API error ${res.status}: ${txt.slice(0, 500)}`);
    }
    const json = (await res.json()) as GeminiContentResponse;
    if (json.error) throw new Error(`Google API error: ${json.error.message ?? 'unknown'}`);
    const text =
      json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .filter(Boolean)
        .join('') ?? '';
    const tokenUsage =
      json.usageMetadata &&
      typeof json.usageMetadata.promptTokenCount === 'number' &&
      typeof json.usageMetadata.candidatesTokenCount === 'number'
        ? {
            input: json.usageMetadata.promptTokenCount,
            output: json.usageMetadata.candidatesTokenCount,
          }
        : null;
    return { text, tokenUsage };
  },
};
