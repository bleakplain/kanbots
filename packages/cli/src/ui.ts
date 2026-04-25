const colorEnabled = process.stdout.isTTY === true && !process.env.NO_COLOR;

function wrap(code: string, s: string): string {
  if (!colorEnabled) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
}

export const green = (s: string): string => wrap('32', s);
export const red = (s: string): string => wrap('31', s);
export const yellow = (s: string): string => wrap('33', s);
export const blue = (s: string): string => wrap('34', s);
export const bold = (s: string): string => wrap('1', s);
export const dim = (s: string): string => wrap('2', s);

export interface Logger {
  success(msg: string): void;
  failure(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  raw(msg: string): void;
}

export const consoleLogger: Logger = {
  success: (m) => console.log(`${green('✓')} ${m}`),
  failure: (m) => console.error(`${red('✗')} ${m}`),
  info: (m) => console.log(`${blue('•')} ${m}`),
  warn: (m) => console.warn(`${yellow('!')} ${m}`),
  raw: (m) => console.log(m),
};
