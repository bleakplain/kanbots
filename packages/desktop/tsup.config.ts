import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { main: 'src/main.ts' },
    format: ['cjs'],
    target: 'node20',
    outExtension: () => ({ js: '.cjs' }),
    platform: 'node',
    bundle: true,
    noExternal: [/^@kanbots\//, /^@octokit\//, 'before-after-hook', 'universal-user-agent'],
    external: ['electron', 'better-sqlite3', 'bindings', 'file-uri-to-path'],
    clean: true,
    sourcemap: false,
    minify: false,
  },
  {
    entry: { preload: 'src/preload.ts' },
    format: ['cjs'],
    target: 'node20',
    outExtension: () => ({ js: '.cjs' }),
    platform: 'node',
    external: ['electron'],
    sourcemap: false,
  },
]);
