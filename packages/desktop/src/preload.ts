import { contextBridge, ipcRenderer } from 'electron';
import type { BootstrapPayload, KanbotsBridge, RecentWorkspace } from './types.js';

const api: KanbotsBridge = {
  bootstrap: () => ipcRenderer.invoke('kanbots:bootstrap') as Promise<BootstrapPayload>,
  pickFolder: () => ipcRenderer.invoke('kanbots:pick-folder') as Promise<string | null>,
  openWorkspace: (repoPath: string) =>
    ipcRenderer.invoke('kanbots:open-workspace', repoPath) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  closeWorkspace: () => ipcRenderer.invoke('kanbots:close-workspace') as Promise<void>,
  recentWorkspaces: () =>
    ipcRenderer.invoke('kanbots:recent-workspaces') as Promise<RecentWorkspace[]>,
};

contextBridge.exposeInMainWorld('kanbots', api);
