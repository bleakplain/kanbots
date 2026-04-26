import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { z } from 'zod';

export interface DraftIssueInput {
  description: string;
}

export interface DraftedIssue {
  title: string;
  body: string;
}

export interface CreateComposerOptions {
  cwd: string;
  command?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  spawn?: SpawnFn;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { cwd: string },
) => ChildProcess;

export type DraftIssueFn = (input: DraftIssueInput) => Promise<DraftedIssue>;

const DEFAULT_TIMEOUT_MS = 120_000;

const ISSUE_JSON_SCHEMA = {
  type: 'object',
  required: ['title', 'body'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 3, maxLength: 200 },
    body: { type: 'string' },
  },
} as const;

const DEFAULT_SYSTEM_PROMPT = `You are an issue composer for a software project.

The user gives you a natural-language description. Produce a single well-structured GitHub issue.

You have read-only access to the repo via Read, Glob, and Grep. Investigate when it would make the issue clearer or more actionable — e.g. naming the right file/symbol — but do not over-investigate. Aim for a draft within a few tool calls.

Rules:
- Title: concise, imperative, ≤80 chars, no trailing punctuation.
- Body: markdown. Cover problem/motivation, proposed approach (if obvious from the user's input), and acceptance criteria. Reference files or symbols by path when you have grounded them in the code.
- Do NOT invent details the user did not provide and that you cannot verify. If something is unclear, write the body so the implementer knows what's underspecified rather than guessing.
- Output strictly the JSON object matching the schema.
`;

const draftedSchema = z
  .object({
    title: z.string().min(1),
    body: z.string(),
  })
  .strict();

const claudeResultSchema = z
  .object({
    type: z.literal('result'),
    is_error: z.boolean(),
    subtype: z.string().optional(),
    result: z.string().optional(),
    structured_output: z.unknown().optional(),
  })
  .passthrough();

export class ComposerError extends Error {
  constructor(
    message: string,
    public readonly stderr: string = '',
  ) {
    super(message);
    this.name = 'ComposerError';
  }
}

export function createComposer(opts: CreateComposerOptions): DraftIssueFn {
  const command = opts.command ?? 'claude';
  const cwd = opts.cwd;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const spawn = opts.spawn ?? nodeSpawn;

  return async function draftIssue(input: DraftIssueInput): Promise<DraftedIssue> {
    const args = [
      '-p',
      '--output-format',
      'json',
      '--no-session-persistence',
      '--system-prompt',
      systemPrompt,
      '--json-schema',
      JSON.stringify(ISSUE_JSON_SCHEMA),
      '--tools',
      'Read,Glob,Grep',
    ];

    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    if (!child.stdin) {
      clearTimeout(timer);
      throw new ComposerError('failed to open stdin to claude');
    }
    child.stdin.write(input.description);
    child.stdin.end();

    const exitCode: number = await new Promise((resolve, reject) => {
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? 0);
      });
    });

    if (killedByTimeout) {
      throw new ComposerError(`composer timed out after ${timeoutMs}ms`, stderr);
    }
    if (exitCode !== 0) {
      throw new ComposerError(`claude exited with code ${exitCode}`, stderr);
    }

    const parsedJson = parseJsonOrThrow(stdout, stderr);
    const result = claudeResultSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new ComposerError(`unexpected claude output shape: ${result.error.message}`, stderr);
    }
    if (result.data.is_error) {
      throw new ComposerError(result.data.result ?? 'claude reported an error', stderr);
    }
    const drafted = draftedSchema.safeParse(result.data.structured_output);
    if (!drafted.success) {
      throw new ComposerError(
        `agent did not return a valid drafted issue: ${drafted.error.message}`,
        stderr,
      );
    }
    return drafted.data;
  };
}

function parseJsonOrThrow(stdout: string, stderr: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new ComposerError('claude produced no output', stderr);
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new ComposerError(
      `claude output was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      stderr,
    );
  }
}
