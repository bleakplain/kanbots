#!/usr/bin/env node
const { cpSync, existsSync, mkdirSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');

const here = __dirname;
const desktopRoot = resolve(here, '..');
const webDist = resolve(desktopRoot, '..', 'web', 'dist');
const target = join(desktopRoot, 'dist', 'web');

if (!existsSync(webDist)) {
  console.error(`[copy-web] expected web build at ${webDist}; run \`pnpm --filter @kanbots/web build\` first.`);
  process.exit(1);
}

if (existsSync(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(webDist, target, { recursive: true });
console.log(`[copy-web] copied ${webDist} → ${target}`);
