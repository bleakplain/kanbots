import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../api.js';
import type { AgentEvent, Card, IssueActiveRun } from '../types.js';

interface RunLive {
  currentTool: string | null;
  currentArg: string | null;
  pendingDecision: IssueActiveRun['pendingDecision'];
  eventCount: number;
}

export type RunLiveMap = Map<number, RunLive>;

function summarizeInput(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return null;
  }
}

/**
 * Subscribes one EventSource per active run and exposes a flat map
 * of currentTool / currentArg / pendingDecision keyed by runId so cards
 * can render live state without each opening their own stream.
 *
 * This is the Phase 2 "single shared SSE per active run" contract that
 * Phase 4 (inspector) and Phase 5 (modal) also read from via context.
 */
export function useBoardAgentStreams(runIds: readonly number[]): RunLiveMap {
  const [map, setMap] = useState<RunLiveMap>(() => new Map());
  const sourcesRef = useRef<Map<number, EventSource>>(new Map());

  useEffect(() => {
    const wanted = new Set(runIds);
    const sources = sourcesRef.current;

    // Tear down sources for runs no longer active
    for (const [runId, source] of sources) {
      if (!wanted.has(runId)) {
        source.close();
        sources.delete(runId);
      }
    }

    // Spin up sources for newly active runs
    for (const runId of wanted) {
      if (sources.has(runId)) continue;
      const source = new EventSource(apiUrl(`/api/agent-runs/${runId}/events`));
      sources.set(runId, source);

      source.addEventListener('agent', (e) => {
        try {
          const ev = JSON.parse((e as MessageEvent).data) as AgentEvent;
          if (ev.type !== 'tool_use') {
            setMap((prev) => {
              const cur = prev.get(runId) ?? {
                currentTool: null,
                currentArg: null,
                pendingDecision: null,
                eventCount: 0,
              };
              const next = new Map(prev);
              next.set(runId, { ...cur, eventCount: cur.eventCount + 1 });
              return next;
            });
            return;
          }
          const p = ev.payload as { name?: string; input?: unknown };
          setMap((prev) => {
            const cur = prev.get(runId) ?? {
              currentTool: null,
              currentArg: null,
              pendingDecision: null,
              eventCount: 0,
            };
            const next = new Map(prev);
            next.set(runId, {
              ...cur,
              currentTool: p.name ?? null,
              currentArg: summarizeInput(p.input),
              eventCount: cur.eventCount + 1,
            });
            return next;
          });
        } catch {
          // ignore malformed events
        }
      });

      source.addEventListener('card', (e) => {
        try {
          const card = JSON.parse((e as MessageEvent).data) as Card;
          if (card.type !== 'decision' || card.status !== 'pending') return;
          const p = card.payload as { question?: string; options?: unknown };
          if (typeof p.question !== 'string' || !Array.isArray(p.options)) return;
          const opts = p.options
            .filter(
              (o): o is { value: string; label: string } =>
                typeof o === 'object' &&
                o !== null &&
                typeof (o as { value: unknown }).value === 'string' &&
                typeof (o as { label: unknown }).label === 'string',
            )
            .map((o) => ({ value: o.value, label: o.label }));
          if (opts.length === 0) return;
          setMap((prev) => {
            const cur = prev.get(runId) ?? {
              currentTool: null,
              currentArg: null,
              pendingDecision: null,
              eventCount: 0,
            };
            const next = new Map(prev);
            next.set(runId, {
              ...cur,
              pendingDecision: { question: p.question as string, options: opts },
            });
            return next;
          });
        } catch {
          // ignore
        }
      });

      source.addEventListener('status', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as { status: string };
          // When agent transitions away from awaiting_input, clear the decision
          if (data.status !== 'awaiting_input') {
            setMap((prev) => {
              const cur = prev.get(runId);
              if (!cur || cur.pendingDecision === null) return prev;
              const next = new Map(prev);
              next.set(runId, { ...cur, pendingDecision: null });
              return next;
            });
          }
        } catch {
          // ignore
        }
      });

      source.onerror = () => {
        // EventSource auto-reconnects; nothing to do
      };
    }
  }, [runIds.join(',')]);

  // Cleanup all sources on unmount
  useEffect(() => {
    const sources = sourcesRef.current;
    return () => {
      for (const source of sources.values()) source.close();
      sources.clear();
    };
  }, []);

  return map;
}
