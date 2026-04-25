import type { Logger } from '../../src/ui.js';

export class MemoryLogger implements Logger {
  readonly successes: string[] = [];
  readonly failures: string[] = [];
  readonly infos: string[] = [];
  readonly warnings: string[] = [];
  readonly raws: string[] = [];

  success = (m: string): void => {
    this.successes.push(m);
  };

  failure = (m: string): void => {
    this.failures.push(m);
  };

  info = (m: string): void => {
    this.infos.push(m);
  };

  warn = (m: string): void => {
    this.warnings.push(m);
  };

  raw = (m: string): void => {
    this.raws.push(m);
  };

  all(): string[] {
    return [
      ...this.successes.map((m) => `success: ${m}`),
      ...this.failures.map((m) => `failure: ${m}`),
      ...this.infos.map((m) => `info: ${m}`),
      ...this.warnings.map((m) => `warn: ${m}`),
      ...this.raws.map((m) => `raw: ${m}`),
    ];
  }
}
