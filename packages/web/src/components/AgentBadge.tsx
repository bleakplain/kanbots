import type { AgentKey } from '../types.js';

const LABEL: Record<AgentKey, string> = {
  idle: 'idle',
  queued: 'queued',
  running: 'running',
  blocked: 'blocked',
  review: 'review',
  failed: 'failed',
};

export function AgentBadge({ agent }: { agent: AgentKey }) {
  return <span className={`agent-badge agent-${agent}`}>{LABEL[agent]}</span>;
}
