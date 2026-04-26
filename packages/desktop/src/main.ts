import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import {
  createSupervisor,
  startServer,
  type AgentSupervisor,
  type DraftIssueFn,
} from '@kanbots/api';
import { GitHubClient, resolveGitHubToken, type IssueSource } from '@kanbots/core';
import { createComposer } from '@kanbots/dispatcher';
import {
  describeKanbotsDir,
  ensureGitignoreEntry,
  ensureKanbotsDir,
  findGitRoot,
  LocalIssueSource,
  openStore,
  readWorkspaceConfig,
  resolveGitUserName,
  writeWorkspaceConfig,
  type Store,
  type WorkspaceConfig,
} from '@kanbots/local-store';
import type { ActiveWorkspaceInfo, BootstrapPayload, RecentWorkspace } from './types.js';

interface RunningServer {
  port: number;
  host: string;
  close: () => Promise<void>;
}

interface ActiveWorkspace {
  repoPath: string;
  config: WorkspaceConfig;
  store: Store;
  source: IssueSource;
  supervisor: AgentSupervisor;
  draftIssue: DraftIssueFn;
  server: RunningServer;
}

let activeWorkspace: ActiveWorkspace | null = null;
let mainWindow: BrowserWindow | null = null;

const RECENTS_LIMIT = 20;

function recentsPath(): string {
  return join(app.getPath('userData'), 'workspaces.json');
}

async function readRecents(): Promise<RecentWorkspace[]> {
  try {
    const raw = await readFile(recentsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { recents?: RecentWorkspace[] };
    return Array.isArray(parsed.recents) ? parsed.recents : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    return [];
  }
}

async function writeRecents(list: RecentWorkspace[]): Promise<void> {
  const path = recentsPath();
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify({ recents: list }, null, 2), 'utf-8');
}

async function recordRecent(repoPath: string, displayName: string): Promise<void> {
  const list = await readRecents();
  const filtered = list.filter((r) => r.repoPath !== repoPath);
  filtered.unshift({
    repoPath,
    displayName,
    lastOpenedAt: new Date().toISOString(),
  });
  await writeRecents(filtered.slice(0, RECENTS_LIMIT));
}

async function pruneMissingRecents(): Promise<RecentWorkspace[]> {
  const list = await readRecents();
  const present = list.filter((r) => existsSync(r.repoPath));
  if (present.length !== list.length) await writeRecents(present);
  return present;
}

async function ensureLocalWorkspace(repoPath: string): Promise<WorkspaceConfig> {
  const existing = await readWorkspaceConfig(repoPath);
  if (existing) return existing;
  const authorLogin = await resolveGitUserName(repoPath);
  const config: WorkspaceConfig = {
    mode: 'local',
    name: basename(repoPath),
    authorLogin,
  };
  await writeWorkspaceConfig(repoPath, config);
  return config;
}

async function buildSource(config: WorkspaceConfig, store: Store): Promise<IssueSource> {
  if (config.mode === 'github') {
    const token = await resolveGitHubToken();
    return new GitHubClient({
      owner: config.owner,
      repo: config.repo,
      token,
      cache: store.httpCache,
    });
  }
  return new LocalIssueSource({
    repo: store.localIssues,
    authorLogin: config.authorLogin,
  });
}

async function closeActiveWorkspace(): Promise<void> {
  if (!activeWorkspace) return;
  try {
    await activeWorkspace.server.close();
  } catch {
    // ignore
  }
  try {
    activeWorkspace.store.close();
  } catch {
    // ignore
  }
  activeWorkspace = null;
}

async function openWorkspaceInternal(repoPath: string): Promise<ActiveWorkspaceInfo> {
  const gitRoot = await findGitRoot(repoPath);
  if (!gitRoot) {
    throw new Error(
      `${repoPath} is not inside a git repository. Run \`git init\` there and try again.`,
    );
  }

  await ensureKanbotsDir(gitRoot);
  const config = await ensureLocalWorkspace(gitRoot);

  await closeActiveWorkspace();

  const kdir = describeKanbotsDir(gitRoot);
  const store = openStore({ path: kdir.dbPath });

  let source: IssueSource;
  try {
    source = await buildSource(config, store);
  } catch (err) {
    store.close();
    throw err;
  }

  const supervisor = createSupervisor({ store, repoPath: gitRoot });
  const draftIssue = createComposer({ cwd: gitRoot });

  const apiConfig =
    config.mode === 'github'
      ? {
          mode: 'github' as const,
          owner: config.owner,
          repo: config.repo,
          repoPath: gitRoot,
        }
      : {
          mode: 'local' as const,
          owner: 'local',
          repo: config.name,
          repoPath: gitRoot,
          authorLogin: config.authorLogin,
        };

  const server = await startServer({
    source,
    store,
    config: apiConfig,
    draftIssue,
    supervisor,
    port: 0,
    host: '127.0.0.1',
  });

  activeWorkspace = {
    repoPath: gitRoot,
    config,
    store,
    source,
    supervisor,
    draftIssue,
    server,
  };

  await ensureGitignoreEntry(gitRoot, '.kanbots/').catch(() => {
    // best-effort
  });

  const displayName = config.mode === 'local' ? config.name : `${config.owner}/${config.repo}`;
  await recordRecent(gitRoot, displayName);

  return { repoPath: gitRoot, config };
}

function activeWorkspaceInfo(): ActiveWorkspaceInfo | null {
  if (!activeWorkspace) return null;
  return { repoPath: activeWorkspace.repoPath, config: activeWorkspace.config };
}

function apiBaseUrl(): string {
  if (!activeWorkspace) return '';
  return `http://${activeWorkspace.server.host}:${activeWorkspace.server.port}`;
}

function registerIpc(): void {
  ipcMain.handle('kanbots:bootstrap', async (): Promise<BootstrapPayload> => {
    const recents = await pruneMissingRecents();
    return {
      apiBaseUrl: apiBaseUrl(),
      workspace: activeWorkspaceInfo(),
      recents,
    };
  });

  ipcMain.handle('kanbots:pick-folder', async (): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open kanbots workspace',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(
    'kanbots:open-workspace',
    async (_event, repoPath: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        await openWorkspaceInternal(repoPath);
        if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle('kanbots:close-workspace', async (): Promise<void> => {
    await closeActiveWorkspace();
    if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
  });

  ipcMain.handle('kanbots:recent-workspaces', async (): Promise<RecentWorkspace[]> => {
    return pruneMissingRecents();
  });
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'kanbots',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.KANBOTS_OPEN_DEVTOOLS) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  const devUrl = process.env.KANBOTS_RENDERER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    // Renderer is copied into dist/web/ during build; layout: dist/main.cjs → dist/web/index.html.
    await win.loadFile(join(__dirname, 'web', 'index.html'));
  }
}

void app.whenReady().then(async () => {
  registerIpc();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await closeActiveWorkspace();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await closeActiveWorkspace();
});
