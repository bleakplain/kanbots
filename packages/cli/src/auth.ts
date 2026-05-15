import { readFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

// Cloud-only launch: the desktop writes its session at the Electron
// `userData` path for product name "kanbots". Mirror Electron's per-platform
// defaults so the CLI can refuse to run when there is no session.
function userDataDir(): string {
  const product = 'kanbots';
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', product);
    case 'win32':
      return join(process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), product);
    default:
      return join(process.env['XDG_CONFIG_HOME'] ?? join(home, '.config'), product);
  }
}

interface MinimalCloudConfig {
  v?: unknown;
  token_id?: unknown;
}

/**
 * Verifies a non-empty Kanbots Cloud session is present on disk. The CLI
 * cannot decrypt safeStorage-protected tokens, but presence of a token_id
 * is sufficient to gate command execution — the desktop performs the real
 * validation when commands route through the bridge.
 */
export async function requireCloudAuth(): Promise<void> {
  const path = join(userDataDir(), 'cloud-config.json');
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as MinimalCloudConfig;
    if (parsed.v !== 1 || typeof parsed.token_id !== 'string' || parsed.token_id.length === 0) {
      bail();
    }
  } catch {
    bail();
  }
}

function bail(): never {
  process.stderr.write(
    'kanbots: cloud sign-in required.\n' +
      '  Open the kanbots desktop app and sign in to Kanbots Cloud before running CLI commands.\n',
  );
  process.exit(2);
}
