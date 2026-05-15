import { readFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

// Cloud-only launch: mirrors `packages/cli/src/auth.ts`. The MCP server
// runs as a standalone Node process spawned by external model clients,
// so it needs an Electron-independent way to confirm there is a signed-in
// kanbots session. Duplicated rather than shared to keep this package's
// dependency surface tiny (only @modelcontextprotocol/sdk).
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
    '[kanbots-mcp] cloud sign-in required.\n' +
      '  Open the kanbots desktop app and sign in to Kanbots Cloud before starting the MCP server.\n',
  );
  process.exit(2);
}
