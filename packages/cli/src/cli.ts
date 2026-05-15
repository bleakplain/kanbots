#!/usr/bin/env node
import { Command } from 'commander';
import pkg from '../package.json' with { type: 'json' };
import { requireCloudAuth } from './auth.js';

export const program = new Command();
program.name('kanbots').version(pkg.version);

// Cloud-only launch: every subcommand requires an active Kanbots Cloud
// session. The hook fires before any action and short-circuits with a
// clear message + non-zero exit when the user has not signed in via the
// desktop app.
program.hook('preAction', async () => {
  await requireCloudAuth();
});

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse(process.argv);
}
