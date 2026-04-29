export type RateLimitKind = 'rate_limit' | 'overloaded' | 'quota';

export type StreamEvent =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; toolUseId: string; name: string; input: unknown }
  | {
      kind: 'tool_result';
      toolUseId: string;
      isError: boolean;
      content: unknown;
    }
  | { kind: 'session'; sessionId: string; model: string | null }
  | {
      kind: 'decision';
      question: string;
      options: Array<{ value: string; label: string }>;
    }
  | {
      kind: 'result';
      isError: boolean;
      text: string;
      tokenUsage: { input: number; output: number } | null;
      durationMs: number | null;
      totalCostUsd: number | null;
    }
  | {
      kind: 'rate_limit';
      reason: RateLimitKind;
      retryAfterMs: number | null;
      message: string;
    }
  | { kind: 'parse_error'; raw: string; message: string };

export interface DecisionPayload {
  question: string;
  options: Array<{ value: string; label: string }>;
}

interface AssistantContentText {
  type: 'text';
  text: string;
}
interface AssistantContentToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}
interface AssistantContentThinking {
  type: 'thinking';
}
type AssistantContent =
  | AssistantContentText
  | AssistantContentToolUse
  | AssistantContentThinking
  | { type: string };

interface UserContentToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}
type UserContent = UserContentToolResult | { type: string };

interface RawAssistant {
  type: 'assistant';
  message: { content: AssistantContent[] };
}
interface RawUser {
  type: 'user';
  message: { content: UserContent[] };
}
interface RawResult {
  type: 'result';
  is_error: boolean;
  result?: string;
  subtype?: string;
  error?: unknown;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface RawSystemInit {
  type: 'system';
  subtype?: string;
  session_id?: string;
  model?: string;
}

export function parseStreamLine(line: string): StreamEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return [
      {
        kind: 'parse_error',
        raw: trimmed,
        message: err instanceof Error ? err.message : String(err),
      },
    ];
  }
  if (!isObject(parsed) || typeof parsed.type !== 'string') return [];

  switch (parsed.type) {
    case 'assistant':
      return mapAssistant(parsed as unknown as RawAssistant);
    case 'user':
      return mapUser(parsed as unknown as RawUser);
    case 'result': {
      const raw = parsed as unknown as RawResult;
      const result = mapResult(raw);
      const out: StreamEvent[] = [];
      if (result.isError) {
        const rl = detectRateLimit(result.text, raw);
        if (rl) out.push(rl);
      }
      out.push(result);
      return out;
    }
    case 'system':
      return mapSystem(parsed as unknown as RawSystemInit);
    default:
      return [];
  }
}

const RATE_LIMIT_PATTERNS: Array<{ kind: RateLimitKind; re: RegExp }> = [
  { kind: 'overloaded', re: /overloaded[_ ]error|"overloaded"|\boverloaded\b/i },
  { kind: 'rate_limit', re: /rate[_ ]limit[_ ]?error|\brate[- ]?limit(ed|ing)?\b|\b429\b|too[_ ]many[_ ]requests/i },
  { kind: 'quota', re: /quota[_ ]exceeded|\bquota\b/i },
];

const RETRY_AFTER_PATTERNS: RegExp[] = [
  /retry[-_ ]after[^\d]{0,12}(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|seconds|m|minutes)?/i,
  /try again in[^\d]{0,12}(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|seconds|m|minutes)?/i,
  /resets? (?:in|after)[^\d]{0,12}(\d+(?:\.\d+)?)\s*(ms|milliseconds|s|seconds|m|minutes)?/i,
];

export function detectRateLimit(
  text: string,
  raw?: { error?: unknown; subtype?: unknown },
): Extract<StreamEvent, { kind: 'rate_limit' }> | null {
  const haystack = buildRateLimitHaystack(text, raw);
  if (!haystack) return null;
  let kind: RateLimitKind | null = null;
  for (const { kind: k, re } of RATE_LIMIT_PATTERNS) {
    if (re.test(haystack)) {
      kind = k;
      break;
    }
  }
  if (!kind) return null;
  return {
    kind: 'rate_limit',
    reason: kind,
    retryAfterMs: extractRetryAfterMs(haystack, raw),
    message: text.slice(0, 500),
  };
}

function buildRateLimitHaystack(
  text: string,
  raw?: { error?: unknown; subtype?: unknown },
): string {
  const parts: string[] = [];
  if (typeof text === 'string') parts.push(text);
  if (raw && typeof raw.subtype === 'string') parts.push(raw.subtype);
  if (raw && raw.error !== undefined) {
    try {
      parts.push(typeof raw.error === 'string' ? raw.error : JSON.stringify(raw.error));
    } catch {
      // ignore
    }
  }
  return parts.join('\n');
}

function extractRetryAfterMs(
  haystack: string,
  raw?: { error?: unknown },
): number | null {
  // Prefer a structured retry_after on the error object if present.
  if (raw && isObject(raw.error)) {
    const errObj = raw.error as Record<string, unknown>;
    const candidates: unknown[] = [
      errObj.retry_after_ms,
      errObj.retryAfterMs,
      errObj.retry_after,
      errObj.retryAfter,
    ];
    for (const c of candidates) {
      if (typeof c === 'number' && Number.isFinite(c) && c >= 0) {
        // retry_after_ms is unambiguously ms; the others are seconds by convention.
        const isMsField = c === errObj.retry_after_ms || c === errObj.retryAfterMs;
        return Math.round(isMsField ? c : c * 1000);
      }
      if (typeof c === 'string') {
        const n = Number(c);
        if (Number.isFinite(n) && n >= 0) return Math.round(n * 1000);
      }
    }
  }
  for (const re of RETRY_AFTER_PATTERNS) {
    const m = haystack.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 0) continue;
    const unit = (m[2] ?? 's').toLowerCase();
    if (unit === 'ms' || unit === 'milliseconds') return Math.round(n);
    if (unit === 'm' || unit === 'minutes') return Math.round(n * 60_000);
    return Math.round(n * 1000);
  }
  return null;
}

function mapSystem(raw: RawSystemInit): StreamEvent[] {
  if (raw.subtype === 'init' && typeof raw.session_id === 'string') {
    return [
      {
        kind: 'session',
        sessionId: raw.session_id,
        model: typeof raw.model === 'string' ? raw.model : null,
      },
    ];
  }
  return [];
}

function mapAssistant(raw: RawAssistant): StreamEvent[] {
  const content = raw.message?.content;
  if (!Array.isArray(content)) return [];
  const out: StreamEvent[] = [];
  for (const item of content) {
    if (item.type === 'text' && typeof (item as AssistantContentText).text === 'string') {
      const text = (item as AssistantContentText).text;
      out.push(...extractTextEvents(text));
    } else if (item.type === 'tool_use') {
      const tu = item as AssistantContentToolUse;
      if (typeof tu.id === 'string' && typeof tu.name === 'string') {
        out.push({ kind: 'tool_use', toolUseId: tu.id, name: tu.name, input: tu.input });
      }
    }
    // thinking and other content types are ignored
  }
  return out;
}

const DECISION_BLOCK_RE = /```kanbots-decision\s*\n([\s\S]*?)\n```/g;

function extractTextEvents(text: string): StreamEvent[] {
  if (text.length === 0) return [];
  const out: StreamEvent[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(DECISION_BLOCK_RE)) {
    const before = text.slice(lastIndex, match.index ?? 0);
    if (before.trim().length > 0) out.push({ kind: 'text', text: before });
    const body = match[1] ?? '';
    const decision = parseDecisionBody(body);
    if (decision) out.push(decision);
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  const tail = text.slice(lastIndex);
  if (tail.trim().length > 0) out.push({ kind: 'text', text: tail });
  if (out.length === 0 && text.trim().length > 0) {
    out.push({ kind: 'text', text });
  }
  return out;
}

function parseDecisionBody(body: string): StreamEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const question = typeof parsed.question === 'string' ? parsed.question : null;
  const rawOptions = Array.isArray(parsed.options) ? parsed.options : null;
  if (!question || !rawOptions) return null;
  const options: Array<{ value: string; label: string }> = [];
  for (const opt of rawOptions) {
    if (!isObject(opt)) continue;
    const value = typeof opt.value === 'string' ? opt.value : null;
    const label = typeof opt.label === 'string' ? opt.label : value;
    if (value && label) options.push({ value, label });
  }
  if (options.length === 0) return null;
  return { kind: 'decision', question, options };
}

function mapUser(raw: RawUser): StreamEvent[] {
  const content = raw.message?.content;
  if (!Array.isArray(content)) return [];
  const out: StreamEvent[] = [];
  for (const item of content) {
    if (item.type === 'tool_result') {
      const tr = item as UserContentToolResult;
      if (typeof tr.tool_use_id === 'string') {
        out.push({
          kind: 'tool_result',
          toolUseId: tr.tool_use_id,
          isError: tr.is_error === true,
          content: tr.content,
        });
      }
    }
  }
  return out;
}

function mapResult(raw: RawResult): Extract<StreamEvent, { kind: 'result' }> {
  const tokenUsage =
    raw.usage &&
    typeof raw.usage.input_tokens === 'number' &&
    typeof raw.usage.output_tokens === 'number'
      ? { input: raw.usage.input_tokens, output: raw.usage.output_tokens }
      : null;
  return {
    kind: 'result',
    isError: raw.is_error === true,
    text: raw.result ?? '',
    tokenUsage,
    durationMs: typeof raw.duration_ms === 'number' ? raw.duration_ms : null,
    totalCostUsd: typeof raw.total_cost_usd === 'number' ? raw.total_cost_usd : null,
  };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function makeLineSplitter(): (chunk: string) => string[] {
  let buffer = '';
  return (chunk: string): string[] => {
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    return parts.filter((p) => p.length > 0);
  };
}
