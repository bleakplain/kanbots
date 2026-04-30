import type { StreamEvent } from '../stream-parser.js';

export interface BuildArgsInput {
  resumeFromSessionId?: string;
  allowedTools?: string;
  appendSystemPrompt?: string;
  model?: string;
  extraArgs?: readonly string[];
}

export type PromptDelivery = 'stdin' | 'argv';

export interface AgentCliAdapter {
  command: string;
  promptDelivery: PromptDelivery;
  buildArgs(opts: BuildArgsInput): string[];
  parseLine(line: string): StreamEvent[];
  detectRateLimit?(stderrChunk: string): Extract<StreamEvent, { kind: 'rate_limit' }> | null;
}
