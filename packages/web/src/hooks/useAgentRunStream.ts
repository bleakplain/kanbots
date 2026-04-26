import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../api.js';
import type { AgentEvent, AgentRunStatus, Card } from '../types.js';

export interface AgentRunStreamState {
  events: AgentEvent[];
  cards: Card[];
  status: AgentRunStatus | null;
  error: string | null;
}

export function useAgentRunStream(runId: number | null): AgentRunStreamState {
  const [state, setState] = useState<AgentRunStreamState>({
    events: [],
    cards: [],
    status: null,
    error: null,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (runId === null) {
      setState({ events: [], cards: [], status: null, error: null });
      return;
    }

    setState({ events: [], cards: [], status: null, error: null });
    const url = apiUrl(`/api/agent-runs/${runId}/events`);
    const source = new EventSource(url);

    source.addEventListener('agent', (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as AgentEvent;
        setState((prev) => {
          if (prev.events.some((existing) => existing.seq === ev.seq)) return prev;
          const next = [...prev.events, ev].sort((a, b) => a.seq - b.seq);
          return { ...prev, events: next };
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    });

    source.addEventListener('card', (e) => {
      try {
        const card = JSON.parse((e as MessageEvent).data) as Card;
        setState((prev) => {
          const exists = prev.cards.some((c) => c.id === card.id);
          if (exists) {
            return {
              ...prev,
              cards: prev.cards.map((c) => (c.id === card.id ? card : c)),
            };
          }
          return { ...prev, cards: [...prev.cards, card] };
        });
      } catch {
        // ignore
      }
    });

    source.addEventListener('status', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { status: AgentRunStatus };
        setState((prev) => ({ ...prev, status: data.status }));
      } catch {
        // ignore
      }
    });

    source.onerror = () => {
      setState((prev) => (prev.events.length === 0 ? { ...prev, error: 'connection lost' } : prev));
    };

    return () => {
      source.close();
    };
  }, [runId]);

  return state;
}
