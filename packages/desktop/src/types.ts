import type { WorkspaceConfig } from '@kanbots/local-store';

export interface ActiveWorkspaceInfo {
  repoPath: string;
  config: WorkspaceConfig;
}

export interface RecentWorkspace {
  repoPath: string;
  displayName: string;
  lastOpenedAt: string;
}

export interface BootstrapPayload {
  apiBaseUrl: string;
  workspace: ActiveWorkspaceInfo | null;
  recents: RecentWorkspace[];
}

export interface KanbotsBridge {
  bootstrap(): Promise<BootstrapPayload>;
  pickFolder(): Promise<string | null>;
  openWorkspace(repoPath: string): Promise<{ ok: true } | { ok: false; error: string }>;
  closeWorkspace(): Promise<void>;
  recentWorkspaces(): Promise<RecentWorkspace[]>;
}

declare global {
  interface Window {
    kanbots?: KanbotsBridge;
  }
}
