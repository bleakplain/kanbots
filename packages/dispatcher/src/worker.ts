import { spawn as nodeSpawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { SpawnFn } from './composer.js';
import { makeLineSplitter, parseStreamLine, type StreamEvent } from './stream-parser.js';

export interface StartAgentRunOptions {
  cwd: string;
  prompt: string;
  appendSystemPrompt?: string;
  allowedTools?: string;
  resumeFromSessionId?: string;
  model?: string;
  command?: string;
  spawn?: SpawnFn;
}

export interface RunResult {
  isError: boolean;
  text: string;
  tokenUsage: { input: number; output: number } | null;
  durationMs: number | null;
  totalCostUsd: number | null;
}

export interface RunSummary {
  exitCode: number | null;
  result: RunResult | null;
  killedByStop: boolean;
  escalatedToKill: boolean;
  stderr: string;
}

export type AgentRunEventName = 'event' | 'close' | 'error';

export interface StopOptions {
  signal?: NodeJS.Signals;
  gracefulTimeoutMs?: number;
}

export interface AgentRunHandle {
  pid: number | null;
  on(event: 'event', handler: (e: StreamEvent) => void): this;
  on(event: 'close', handler: (summary: RunSummary) => void): this;
  on(event: 'error', handler: (err: Error) => void): this;
  off(event: AgentRunEventName, handler: (...args: unknown[]) => void): this;
  stop(opts?: StopOptions | NodeJS.Signals): void;
  done: Promise<RunSummary>;
}

export const DEFAULT_GRACEFUL_TIMEOUT_MS = 10_000;

export function startAgentRun(opts: StartAgentRunOptions): AgentRunHandle {
  const command = opts.command ?? 'claude';
  const spawnFn = opts.spawn ?? nodeSpawn;

  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'bypassPermissions',
  ];
  if (opts.resumeFromSessionId) {
    args.push('--resume', opts.resumeFromSessionId);
  }
  if (opts.allowedTools) {
    args.push('--tools', opts.allowedTools);
  }
  if (opts.appendSystemPrompt) {
    args.push('--append-system-prompt', opts.appendSystemPrompt);
  }
  if (opts.model) {
    args.push('--model', opts.model);
  }

  const child = spawnFn(command, args, { cwd: opts.cwd });
  const emitter = new EventEmitter();

  let result: RunResult | null = null;
  let killedByStop = false;
  let escalatedToKill = false;
  let killTimer: NodeJS.Timeout | null = null;
  let stderr = '';

  const clearKillTimer = (): void => {
    if (killTimer !== null) {
      clearTimeout(killTimer);
      killTimer = null;
    }
  };

  const splitter = makeLineSplitter();
  child.stdout?.on('data', (chunk: Buffer) => {
    const lines = splitter(chunk.toString('utf8'));
    for (const line of lines) {
      const parsed = parseStreamLine(line);
      for (const ev of parsed) {
        if (ev.kind === 'result') {
          result = {
            isError: ev.isError,
            text: ev.text,
            tokenUsage: ev.tokenUsage,
            durationMs: ev.durationMs,
            totalCostUsd: ev.totalCostUsd,
          };
        }
        emitter.emit('event', ev);
      }
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });

  if (child.stdin) {
    child.stdin.write(opts.prompt);
    child.stdin.end();
  }

  const done = new Promise<RunSummary>((resolve) => {
    let settled = false;
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearKillTimer();
      emitter.emit('error', err);
      const summary: RunSummary = {
        exitCode: null,
        result,
        killedByStop,
        escalatedToKill,
        stderr,
      };
      emitter.emit('close', summary);
      resolve(summary);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearKillTimer();
      const summary: RunSummary = {
        exitCode: code ?? null,
        result,
        killedByStop,
        escalatedToKill,
        stderr,
      };
      emitter.emit('close', summary);
      resolve(summary);
    });
  });

  const handle: AgentRunHandle = {
    pid: child.pid ?? null,
    on(event, handler): AgentRunHandle {
      emitter.on(event, handler as (...args: unknown[]) => void);
      return handle;
    },
    off(event, handler): AgentRunHandle {
      emitter.off(event, handler);
      return handle;
    },
    stop(arg?: StopOptions | NodeJS.Signals): void {
      if (killedByStop) return;
      killedByStop = true;
      const stopOpts: StopOptions =
        typeof arg === 'string' ? { signal: arg } : (arg ?? {});
      const signal = stopOpts.signal ?? 'SIGTERM';
      const gracefulTimeoutMs = stopOpts.gracefulTimeoutMs ?? DEFAULT_GRACEFUL_TIMEOUT_MS;
      child.kill(signal);
      if (signal === 'SIGKILL' || gracefulTimeoutMs <= 0) return;
      killTimer = setTimeout(() => {
        killTimer = null;
        escalatedToKill = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // child may already be gone; close handler will settle naturally
        }
      }, gracefulTimeoutMs);
      // Ensure the timer doesn't keep the event loop alive on its own.
      if (typeof killTimer.unref === 'function') killTimer.unref();
    },
    done,
  };
  return handle;
}
