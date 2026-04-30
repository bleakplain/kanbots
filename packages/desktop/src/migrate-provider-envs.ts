import { existsSync } from 'node:fs';
import type { ProviderId, Store } from '@kanbots/local-store';
import { CREDENTIALS_PATH as CLAUDE_CREDENTIALS_PATH } from './claude-auth.js';
import { encryptProviderKey } from './providers-key.js';

const ENV_MAP: ReadonlyArray<{ id: ProviderId; envVars: string[] }> = [
  { id: 'anthropic', envVars: ['ANTHROPIC_API_KEY'] },
  { id: 'openai', envVars: ['OPENAI_API_KEY'] },
  { id: 'google', envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
  { id: 'deepseek', envVars: ['DEEPSEEK_API_KEY'] },
  { id: 'xai', envVars: ['XAI_API_KEY', 'GROK_API_KEY'] },
];

const PROVIDER_PRIORITY: ReadonlyArray<ProviderId> = [
  'claude-code',
  'anthropic',
  'openai',
  'google',
  'xai',
  'deepseek',
];

/**
 * One-time migration of legacy env-var auth into the providers store.
 * Honored on first run only; subsequent runs ignore env vars entirely.
 *
 * - For each {ANTHROPIC,OPENAI,...}_API_KEY env var that is set: encrypt &
 *   persist into the corresponding provider row, mark it `enabled`.
 * - For Claude Code: if `~/.claude/.credentials.json` exists, mark `enabled`.
 * - If at least one provider was imported, set the global default to the
 *   first one in the priority list.
 */
export function migrateProviderEnvVars(store: Store): void {
  const settings = store.providerSettings.get();
  if (settings.envMigrationDone) return;

  const imported: ProviderId[] = [];

  // Claude Code: file-based credentials, no key to import.
  if (existsSync(CLAUDE_CREDENTIALS_PATH)) {
    const cfg = store.providers.get('claude-code');
    if (!cfg.enabled) store.providers.update('claude-code', { enabled: true });
    imported.push('claude-code');
  }

  for (const { id, envVars } of ENV_MAP) {
    const value = envVars.map((v) => process.env[v]).find((v) => v && v.length > 0);
    if (!value) continue;
    const cfg = store.providers.get(id);
    if (cfg.keyEncrypted !== null && cfg.keyEncrypted.length > 0) {
      // Already has a key — don't clobber.
      imported.push(id);
      continue;
    }
    const { buffer, encryption } = encryptProviderKey(value);
    store.providers.update(id, {
      enabled: true,
      keyEncrypted: buffer,
      keyEncryption: encryption,
      lastError: null,
    });
    imported.push(id);
  }

  if (imported.length > 0 && !settings.defaultProvider) {
    const first = PROVIDER_PRIORITY.find((p) => imported.includes(p));
    if (first) store.providerSettings.update({ defaultProvider: first });
  }

  store.providerSettings.markEnvMigrationDone();
}
