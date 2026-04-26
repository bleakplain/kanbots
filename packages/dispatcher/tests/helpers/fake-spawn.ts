import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import type { SpawnFn } from '../../src/composer.js';

export interface FakeSpawnCall {
  command: string;
  args: readonly string[];
  cwd: string;
  stdin: string;
}

export interface FakeSpawnOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  exitDelayMs?: number;
  errorOnSpawn?: Error;
  hangs?: boolean;
}

export interface FakeSpawn {
  fn: SpawnFn;
  calls: FakeSpawnCall[];
  killSignals: string[];
}

export function makeFakeSpawn(opts: FakeSpawnOptions = {}): FakeSpawn {
  const calls: FakeSpawnCall[] = [];
  const killSignals: string[] = [];

  const fn: SpawnFn = (command, args, options) => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    const child = new EventEmitter() as ChildProcess & { stdin: PassThrough };
    Object.assign(child, { stdout, stderr, stdin });
    let stdinBuffer = '';
    stdin.on('data', (chunk: Buffer) => {
      stdinBuffer += chunk.toString('utf8');
    });

    let closed = false;
    const emitClose = (code: number): void => {
      if (closed) return;
      closed = true;
      stdout.end(opts.stdout ?? '');
      stderr.end(opts.stderr ?? '');
      child.emit('close', code);
    };

    child.kill = ((signal?: NodeJS.Signals | number) => {
      killSignals.push(typeof signal === 'string' ? signal : 'SIGTERM');
      setImmediate(() => emitClose(143));
      return true;
    }) as ChildProcess['kill'];

    if (opts.errorOnSpawn) {
      queueMicrotask(() => child.emit('error', opts.errorOnSpawn));
      calls.push({ command, args, cwd: options.cwd, stdin: stdinBuffer });
      return child;
    }

    const finalize = (): void => {
      calls.push({ command, args, cwd: options.cwd, stdin: stdinBuffer });
      emitClose(opts.exitCode ?? 0);
    };

    if (opts.hangs) {
      stdin.on('finish', () => {
        calls.push({ command, args, cwd: options.cwd, stdin: stdinBuffer });
      });
    } else {
      stdin.on('finish', () => {
        if (opts.exitDelayMs && opts.exitDelayMs > 0) {
          setTimeout(finalize, opts.exitDelayMs);
        } else {
          setImmediate(finalize);
        }
      });
    }

    return child;
  };

  return { fn, calls, killSignals };
}

export function buildClaudeJsonOutput(
  drafted: { title: string; body: string } | null,
  overrides: Partial<{ is_error: boolean; result: string }> = {},
): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: overrides.is_error ?? false,
    result: overrides.result ?? '',
    structured_output: drafted,
    duration_ms: 1234,
    num_turns: 1,
  });
}
