export interface ActiveWorkspaceInfo {
  repoPath: string;
  config:
    | { mode: 'github'; owner: string; repo: string }
    | { mode: 'local'; name: string; authorLogin: string };
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

export function getBridge(): KanbotsBridge | null {
  return typeof window !== 'undefined' && window.kanbots ? window.kanbots : null;
}
