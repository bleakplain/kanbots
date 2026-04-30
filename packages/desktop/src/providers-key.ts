import { existsSync } from 'node:fs';
import { safeStorage } from 'electron';
import type { ProviderKeyEncryption } from '@kanbots/local-store';
import { CREDENTIALS_PATH as CLAUDE_CREDENTIALS_PATH } from './claude-auth.js';

export interface EncryptedKey {
  buffer: Buffer;
  encryption: ProviderKeyEncryption;
}

export function encryptProviderKey(plaintext: string): EncryptedKey {
  if (safeStorage.isEncryptionAvailable()) {
    return { buffer: safeStorage.encryptString(plaintext), encryption: 'safe' };
  }
  return { buffer: Buffer.from(plaintext, 'utf8'), encryption: 'plain' };
}

export function decryptProviderKey(
  buffer: Buffer | null,
  encryption: ProviderKeyEncryption,
): string | null {
  if (!buffer || buffer.length === 0) return null;
  if (encryption === 'safe') {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(buffer);
    } catch {
      return null;
    }
  }
  return buffer.toString('utf8');
}

export function safeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function hasClaudeCodeCredentials(): boolean {
  return existsSync(CLAUDE_CREDENTIALS_PATH);
}
