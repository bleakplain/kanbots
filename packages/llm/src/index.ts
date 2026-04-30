export const PACKAGE_NAME = '@kanbots/llm';

export {
  MODELS,
  findModel,
  modelsForProvider,
  recommendedModel,
} from './catalogue.js';

export { anthropicAdapter } from './adapters/anthropic.js';
export { claudeCodeAdapter } from './adapters/claude-code.js';
export { googleAdapter } from './adapters/google.js';
export {
  buildOpenAICompatibleAdapter,
  deepseekAdapter,
  openaiAdapter,
  xaiAdapter,
} from './adapters/openai-compatible.js';

export { chat, getAdapter, listAdapters, validateProvider } from './manager.js';

export type {
  AgentRunHandle,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ModelEntry,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderCredentials,
  ProviderId,
  StartAgentRunOptions,
  StreamEvent,
  ValidateResult,
} from './types.js';
