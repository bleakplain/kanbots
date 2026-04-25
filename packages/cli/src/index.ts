#!/usr/bin/env node
import { doctorCommand } from './commands/doctor.js';
import { helpCommand } from './commands/help.js';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { versionCommand } from './commands/version.js';

export const PACKAGE_NAME = '@kanbots/cli';

export { initCommand, doctorCommand, helpCommand, startCommand, versionCommand };

export async function runCli(argv: readonly string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);

  switch (sub) {
    case 'init':
      return initCommand(rest);
    case 'doctor':
      return doctorCommand(rest);
    case 'start':
    case undefined:
      return startCommand(rest);
    case 'version':
    case '--version':
    case '-v':
      return versionCommand();
    case 'help':
    case '--help':
    case '-h':
      return helpCommand();
    default:
      console.error(`Unknown command: ${sub}`);
      console.error('Run `kanbots help` for usage.');
      return 1;
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
