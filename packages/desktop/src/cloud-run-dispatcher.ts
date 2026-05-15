import type { CloudClient } from '@kanbots/cloud-client';
import {
  startAgentRun,
  type AgentRunProvider,
  type StreamEvent,
} from '@kanbots/dispatcher';

/**
 * Cloud-mode agent run dispatcher. Mirrors what the local supervisor does,
 * but persists run state to the cloud API instead of local SQLite:
 *
 *   1. POST /orgs/:slug/projects/:slug/cards/:n/runs  → creates a pending run
 *   2. POST /agent/runs/:id/claim                     → marks claimed
 *   3. spawn the user's local Claude/Codex CLI in the bound repo
 *   4. for each parsed StreamEvent, batch + POST /agent/runs/:id/events
 *   5. when the CLI exits, drain the buffer and (if no terminal event was
 *      emitted by the parser) post a synthetic `result` event so the cloud
 *      transitions the run row.
 *
 * Event flush strategy: flush every 50 events or every 500 ms (whichever
 * trips first) so the cloud-side board sees progress quickly without
 * one-POST-per-event overhead. Errors during flush are logged but don't
 * abort the run — partial event loss is preferable to killing an
 * in-progress agent.
 */

const FLUSH_BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 500;

const PROVIDER_TO_CLI: Record<AgentRunProvider, 'claude_code' | 'codex'> = {
  'claude-code': 'claude_code',
  'codex-cli': 'codex',
};
const PROVIDER_TO_PROVIDER_TAG: Record<AgentRunProvider, string> = {
  'claude-code': 'anthropic',
  'codex-cli': 'openai',
};

export interface DispatchCloudRunOptions {
  cloudClient: CloudClient;
  orgSlug: string;
  projectSlug: string;
  cardNumber: number;
  prompt: string;
  appendSystemPrompt?: string;
  model?: string;
  provider?: AgentRunProvider;
  /** Local repo root the CLI runs inside. Must exist. */
  cwd: string;
  /** Optional sink for stream events (e.g. forward to renderer). */
  onEvent?: (event: StreamEvent) => void;
}

export interface CloudRunHandle {
  runId: string;
  /** Resolves once the CLI process exits and the final flush completes. */
  done: Promise<CloudRunSummary>;
  /** Stop the CLI gracefully. */
  stop(): void;
}

export interface CloudRunSummary {
  runId: string;
  /** Final status reported by the cloud after terminal event landed. */
  status: string;
  exitCode: number | null;
}

interface BufferedEvent {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Map a local-parser StreamEvent to the wire shape the cloud's
 * /agent/runs/:id/events endpoint accepts. `kind` becomes `type`; the
 * rest of the discriminated-union fields become the `payload`. `diff_hunk`
 * isn't in the cloud's whitelist yet, so we drop it (the underlying
 * `tool_use` still carries the edit info).
 */
function streamEventToWire(event: StreamEvent): BufferedEvent | null {
  if (event.kind === 'diff_hunk') return null;
  const { kind, ...rest } = event;
  const payload: Record<string, unknown> = { ...rest };
  if (event.kind === 'result') {
    // Cloud derives terminal run.status from payload.status. The local
    // parser only knows isError, so translate.
    payload['status'] = event.isError ? 'failed' : 'succeeded';
    if (event.tokenUsage) {
      payload['tokens_input'] = event.tokenUsage.input;
      payload['tokens_output'] = event.tokenUsage.output;
    }
    if (event.totalCostUsd !== null && event.totalCostUsd !== undefined) {
      payload['cost_usd_cents'] = Math.round(event.totalCostUsd * 100);
    }
  }
  return { type: kind, payload };
}

/**
 * Start a cloud run. Returns *after* the run has been created on the cloud
 * and the CLI subprocess is spawned, so the renderer gets a runId
 * immediately and can subscribe to live events via the cloud SSE stream.
 *
 * The returned `done` promise resolves when the CLI exits and the final
 * event flush + synthetic terminal event (if any) lands on the cloud.
 */
export async function startCloudRun(
  opts: DispatchCloudRunOptions,
): Promise<CloudRunHandle> {
  const provider = opts.provider ?? 'claude-code';

  // Step 1 — create the pending run on the cloud.
  const run = await opts.cloudClient.runs.create(
    opts.orgSlug,
    opts.projectSlug,
    opts.cardNumber,
    {
      cli: PROVIDER_TO_CLI[provider],
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      provider: PROVIDER_TO_PROVIDER_TAG[provider],
    },
  );

  // Step 2 — claim it as the running worker. If this fails we still return
  // the runId so the renderer can surface a status; the background loop
  // won't post events for a run it doesn't own.
  let claimed = false;
  try {
    await opts.cloudClient.runs.claim(run.id);
    claimed = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[cloud-run-dispatcher] claim failed for run ${run.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  // Step 3 — buffer + flush plumbing.
  const buffer: BufferedEvent[] = [];
  let flushing = false;
  let flushTimer: NodeJS.Timeout | null = null;
  let sawTerminalResult = false;
  let runDisposed = false;

  async function flush(): Promise<void> {
    if (!claimed || runDisposed || flushing || buffer.length === 0) return;
    flushing = true;
    const batch = buffer.splice(0, buffer.length);
    try {
      await opts.cloudClient.runs.appendEvents(run.id, batch);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cloud-run-dispatcher] flush failed for run ${run.id}:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      flushing = false;
    }
  }

  function schedule(): void {
    if (buffer.length >= FLUSH_BATCH_SIZE) {
      void flush();
      return;
    }
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, FLUSH_INTERVAL_MS);
    }
  }

  // Step 4 — spawn the CLI.
  const handle = startAgentRun({
    cwd: opts.cwd,
    prompt: opts.prompt,
    ...(opts.appendSystemPrompt !== undefined
      ? { appendSystemPrompt: opts.appendSystemPrompt }
      : {}),
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    provider,
  });

  handle.on('event', (event: StreamEvent) => {
    if (opts.onEvent !== undefined) {
      try {
        opts.onEvent(event);
      } catch {
        // listener crash mustn't tear down the run
      }
    }
    if (event.kind === 'result') sawTerminalResult = true;
    const wire = streamEventToWire(event);
    if (wire === null) return;
    buffer.push(wire);
    schedule();
  });

  // Background completion — drains buffer, posts synthetic terminal if
  // needed, then resolves the public `done` promise.
  const done = (async (): Promise<CloudRunSummary> => {
    const summary = await handle.done;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await flush();

    if (claimed && !sawTerminalResult) {
      const synthStatus = summary.killedByStop
        ? 'stopped'
        : summary.exitCode === 0
          ? 'succeeded'
          : 'failed';
      try {
        await opts.cloudClient.runs.appendEvents(run.id, [
          {
            type: 'result',
            source: 'system',
            payload: {
              status: synthStatus,
              ...(summary.exitCode !== null ? { exit_code: summary.exitCode } : {}),
              ...(summary.killedByStop ? { reason: 'stopped_by_user' } : {}),
              ...(summary.stderr ? { stderr_tail: summary.stderr.slice(-2048) } : {}),
            },
          },
        ]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[cloud-run-dispatcher] failed to post synthetic terminal for ${run.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    runDisposed = true;

    let finalStatus = 'unknown';
    try {
      const final = await opts.cloudClient.runs.get(
        opts.orgSlug,
        opts.projectSlug,
        run.id,
      );
      finalStatus = final.status;
    } catch {
      // best-effort
    }

    return { runId: run.id, status: finalStatus, exitCode: summary.exitCode };
  })();

  return {
    runId: run.id,
    done,
    stop: () => handle.stop(),
  };
}
