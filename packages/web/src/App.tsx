import { useEffect, useMemo, useState } from 'react';
import { useFetch } from './hooks/useFetch.js';
import { useRoute, navigate } from './hooks/useRoute.js';
import { getBridge } from './desktop-bridge.js';
import { useSelection } from './hooks/useSelection.js';
import { useTweaks } from './hooks/useTweaks.js';
import { IssuesProvider, useIssues } from './hooks/useIssues.js';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts.js';
import { Board } from './pages/Board.js';
// Cloud-only launch — phase 1 unification: cloud workspaces render through
// the same ShellHost+Board path as local, fed by mode-aware api.ts. The
// former CloudBoard/CloudColumn/CloudCardModal files have been deleted.
import { CloudWorkspacePicker } from './pages/CloudWorkspacePicker.js';
import { ProvidersOverlay } from './pages/ProvidersOverlay.js';
// Cloud-only launch: local WorkspacePicker is no longer reachable from App
// routing. Kept in the codebase for potential future restore.
// import { WorkspacePicker } from './pages/WorkspacePicker.js';
import { api, setCloudCtx } from './api.js';
import { Window } from './components/shell/Window.js';
import { Shell } from './components/shell/Shell.js';
import { LeftRail } from './components/rail/LeftRail.js';
import { CloudFirstRunPrompt } from './components/CloudFirstRunPrompt.js';
import { TaskDetailModal } from './components/modals/TaskDetailModal.js';
import { TaskCreateModal } from './components/modals/TaskCreateModal.js';
import { SplitModal } from './components/modals/SplitModal.js';
import { ArchiveModal } from './components/modals/ArchiveModal.js';
import { CloudSettingsModal } from './components/modals/CloudSettingsModal.js';
import { HouseRulesSettingsModal } from './components/modals/HouseRulesSettingsModal.js';
import { ProvidersSettingsModal } from './components/modals/ProvidersSettingsModal.js';
import { SentrySettingsModal } from './components/modals/SentrySettingsModal.js';
import { Stats } from './components/Stats.js';
import { Tray } from './components/tray/Tray.js';
import { Palette } from './components/palette/Palette.js';
import { TweaksPanel } from './components/tweaks/TweaksPanel.js';
import type {
  ActiveCloudWorkspaceInfo,
  ActiveWorkspaceInfo,
  RecentCloudWorkspace,
  RecentWorkspace,
} from './desktop-bridge.js';
// `ActiveCloudWorkspaceInfo` is consumed by `CloudBoard`; re-exported here
// only to keep AppProps' contract documented for the bootstrap call site.
export type { ActiveCloudWorkspaceInfo };
import type { Config, Issue } from './types.js';

interface AppProps {
  workspace: ActiveWorkspaceInfo | null;
  cloudWorkspace: ActiveCloudWorkspaceInfo | null;
  initialRecents: RecentWorkspace[];
  initialCloudRecents: RecentCloudWorkspace[];
  hasBridge: boolean;
  initialClaudeAuthed: boolean;
  initialCodexAuthed: boolean;
  initialCloudAuthed: boolean;
  initialCloudPromptDismissed: boolean;
}

function describeFolder(config: Config | null): string {
  if (!config) return '…';
  if (config.mode === 'local') return config.repo;
  return `${config.owner}/${config.repo}`;
}

function ShellHost({
  config,
  workspace,
  cloudWorkspace,
}: {
  config: Config | null;
  workspace: ActiveWorkspaceInfo | null;
  cloudWorkspace: ActiveCloudWorkspaceInfo | null;
}) {
  // Cloud workspaces don't yet carry per-workspace settings like
  // `notifyOnRunComplete` — phase 3's project-config endpoint will surface
  // those server-side. Default to "on" for cloud.
  const [notifyOnRunComplete, setNotifyOnRunCompleteState] = useState<boolean>(
    workspace?.config.notifyOnRunComplete !== false,
  );

  useEffect(() => {
    setNotifyOnRunCompleteState(workspace?.config.notifyOnRunComplete !== false);
  }, [workspace?.config.notifyOnRunComplete]);

  const setNotifyOnRunComplete = (enabled: boolean): void => {
    setNotifyOnRunCompleteState(enabled);
    const bridge = getBridge();
    if (bridge?.setNotifyOnRunComplete) {
      void bridge.setNotifyOnRunComplete(enabled);
    }
  };

  const route = useRoute();
  const [selectedNumber, setSelectedNumber] = useSelection();
  const { tweaks, set: setTweak, reset: resetTweaks } = useTweaks();
  const [detailIssueNumber, setDetailIssueNumber] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitialDescription, setCreateInitialDescription] = useState<string>('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [splitTargetNumber, setSplitTargetNumber] = useState<number | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [providersSettingsOpen, setProvidersSettingsOpen] = useState(false);
  const [cloudSettingsOpen, setCloudSettingsOpen] = useState(false);
  const [houseRulesOpen, setHouseRulesOpen] = useState(false);
  const [sentrySettingsOpen, setSentrySettingsOpen] = useState(false);
  const { mutate, issues } = useIssues();

  useEffect(() => {
    function onOpen(): void {
      setHouseRulesOpen(true);
    }
    window.addEventListener('kanbots:open-house-rules', onOpen);
    return () => window.removeEventListener('kanbots:open-house-rules', onOpen);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.kbRail = tweaks.showRail ? 'on' : 'off';
  }, [tweaks.showRail]);

  useEffect(() => {
    if (route.name === 'issue' && selectedNumber !== route.number) {
      setSelectedNumber(route.number);
    }
  }, [route, selectedNumber, setSelectedNumber]);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    return bridge.subscribe('kanbots:navigate-task', (payload) => {
      const issueNumber =
        typeof payload === 'object' && payload !== null && 'issueNumber' in payload
          ? (payload as { issueNumber: unknown }).issueNumber
          : null;
      if (typeof issueNumber !== 'number') return;
      navigate({ name: 'issue', number: issueNumber });
      setSelectedNumber(issueNumber);
      setDetailIssueNumber(issueNumber);
    });
  }, [setSelectedNumber]);

  const shortcutHandlers = useMemo(
    () => ({
      onPalette: () => setPaletteOpen((v) => !v),
      onCreate: () => {
        setCreateInitialDescription('');
        setCreateOpen(true);
      },
      onClosePopovers: () => {
        setPaletteOpen(false);
        setDetailIssueNumber(null);
        setCreateOpen(false);
        setTweaksOpen(false);
        setSplitTargetNumber(null);
      },
      onResolveTopDecision: () => {
        const blocked = issues.find((i) => i.agent === 'blocked');
        if (blocked) setSelectedNumber(blocked.number);
      },
      onTogglePreview: () => {
        if (selectedNumber !== null) setDetailIssueNumber(selectedNumber);
      },
    }),
    [issues, selectedNumber, setSelectedNumber],
  );
  useGlobalShortcuts(shortcutHandlers);

  function openDetail(n: number): void {
    setDetailIssueNumber(n);
  }
  function closeDetail(): void {
    setDetailIssueNumber(null);
  }
  function openCreate(initialDescription?: string): void {
    setCreateInitialDescription(initialDescription ?? '');
    setCreateOpen(true);
  }
  function handleCreated(issue: Issue): void {
    mutate((prev) => [issue, ...(prev ?? [])]);
    setSelectedNumber(issue.number);
  }

  const reviewReady = issues.find((i) => i.agent === 'review') ?? null;
  const pausedAgent = issues.find((i) => i.agent === 'blocked') ?? null;

  return (
    <>
      <Window
        workspaceName="kanbots workspace"
        folderName={describeFolder(config)}
        branch="main"
        showRail={tweaks.showRail}
        onToggleRail={() => setTweak('showRail', !tweaks.showRail)}
        tweaksOpen={tweaksOpen}
        onToggleTweaks={() => setTweaksOpen((v) => !v)}
      >
        <Shell
          rail={
            tweaks.showRail ? (
              <LeftRail
                selectedNumber={selectedNumber}
                onSelectIssue={setSelectedNumber}
                onOpenPalette={() => setPaletteOpen(true)}
                onOpenArchive={() => setArchiveOpen(true)}
                onOpenStats={() => setStatsOpen(true)}
                onOpenProviders={() => setProvidersSettingsOpen(true)}
                onOpenCloud={() => setCloudSettingsOpen(true)}
                onOpenRules={() => setHouseRulesOpen(true)}
                onOpenSentry={() => setSentrySettingsOpen(true)}
              />
            ) : null
          }
          center={
            <Board
              onOpenDetail={openDetail}
              onOpenCreate={() => openCreate()}
              onOpenPalette={() => setPaletteOpen(true)}
            />
          }
        />
      </Window>
      {detailIssueNumber !== null ? (
        <TaskDetailModal issueNumber={detailIssueNumber} onClose={closeDetail} />
      ) : null}
      {createOpen ? (
        <TaskCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
          initialDescription={createInitialDescription}
        />
      ) : null}
      {tweaks.showTray ? <Tray onJump={(n) => setSelectedNumber(n)} /> : null}
      <Palette
        open={paletteOpen}
        selectedNumber={selectedNumber}
        onClose={() => setPaletteOpen(false)}
        onJump={(n) => setSelectedNumber(n)}
        onOpenCreate={openCreate}
        onOpenDetail={openDetail}
        onOpenSplit={(n) => setSplitTargetNumber(n)}
        onResolveTopDecision={shortcutHandlers.onResolveTopDecision}
      />
      {splitTargetNumber !== null ? (
        <SplitModal
          parentNumber={splitTargetNumber}
          parentTitle={
            issues.find((i) => i.number === splitTargetNumber)?.title ?? `#${splitTargetNumber}`
          }
          onClose={() => setSplitTargetNumber(null)}
        />
      ) : null}
      {archiveOpen ? (
        <ArchiveModal onClose={() => setArchiveOpen(false)} onOpenDetail={openDetail} />
      ) : null}
      {statsOpen ? <Stats onClose={() => setStatsOpen(false)} /> : null}
      {providersSettingsOpen ? (
        <ProvidersSettingsModal onClose={() => setProvidersSettingsOpen(false)} />
      ) : null}
      {cloudSettingsOpen ? (
        <CloudSettingsModal onClose={() => setCloudSettingsOpen(false)} />
      ) : null}
      {houseRulesOpen ? (
        <HouseRulesSettingsModal onClose={() => setHouseRulesOpen(false)} />
      ) : null}
      {sentrySettingsOpen ? (
        <SentrySettingsModal onClose={() => setSentrySettingsOpen(false)} />
      ) : null}
      {tweaksOpen ? (
        <TweaksPanel
          tweaks={tweaks}
          onSet={setTweak}
          onReset={resetTweaks}
          onClose={() => setTweaksOpen(false)}
          onOpenPalette={() => {
            setTweaksOpen(false);
            setPaletteOpen(true);
          }}
          {...(pausedAgent
            ? { onFocusPaused: () => setSelectedNumber(pausedAgent.number) }
            : {})}
          {...(reviewReady
            ? { onFocusReview: () => setSelectedNumber(reviewReady.number) }
            : {})}
          notifyOnRunComplete={notifyOnRunComplete}
          {...(getBridge()
            ? { onSetNotifyOnRunComplete: setNotifyOnRunComplete }
            : {})}
        />
      ) : null}
    </>
  );
}

export function App({
  workspace,
  cloudWorkspace,
  initialRecents,
  initialCloudRecents,
  hasBridge,
  initialClaudeAuthed,
  initialCodexAuthed,
  initialCloudAuthed,
  initialCloudPromptDismissed,
}: AppProps) {
  const [providersTick, setProvidersTick] = useState(0);
  const [cloudAuthed, setCloudAuthed] = useState<boolean>(initialCloudAuthed);

  // Cloud-only launch — phase 1: install the cloud ctx on api.ts before any
  // hook below fires its initial fetch. Setting module state during render
  // is fine here because it's idempotent and the children's useFetch reads
  // it during the same render pass.
  if (cloudWorkspace !== null) {
    setCloudCtx({
      orgSlug: cloudWorkspace.orgSlug,
      projectSlug: cloudWorkspace.projectSlug,
    });
  } else {
    setCloudCtx(null);
  }

  const hasOpenWorkspace = workspace !== null || cloudWorkspace !== null;
  const { data: config } = useFetch(hasOpenWorkspace ? 'config' : null, () => api.config());
  const { data: providers } = useFetch(
    hasOpenWorkspace ? `providers:${providersTick}` : null,
    () => api.getProviders(),
  );

  // Cloud-only launch: the sign-in gate is mandatory. There is no longer a
  // "Continue local-only" exit, so the prompt sits in front of every other
  // route until cloudAuthed becomes true. The cloudPromptDismissed flag from
  // bootstrap is intentionally ignored (legacy installs may carry a
  // dismissal from the old optional gate).
  if (hasBridge && !cloudAuthed) {
    return (
      <CloudFirstRunPrompt
        onSignedIn={() => setCloudAuthed(true)}
      />
    );
  }

  // Cloud-only launch — phase 1 unification: cloud workspace also renders
  // through ShellHost+Board (same chrome, hooks, modals as local), fed by
  // the mode-aware api.ts that the `setCloudCtx` call above just primed.
  // Drag-drop, card creation, and the workspace picker work through the
  // cloud client; cost meters / autopilot / live run streams are stubbed
  // until phases 2-4.

  // Cloud-only launch: no workspace selected → always show the cloud picker.
  // The local WorkspacePicker is no longer reachable from the UI; the
  // `onPickLocal` callback is wired to a no-op so existing callers keep
  // compiling.
  if (hasBridge && workspace === null && cloudWorkspace === null) {
    return (
      <CloudWorkspacePicker
        initialRecents={initialCloudRecents}
        onPickLocal={() => undefined}
        onOpened={() => window.location.reload()}
      />
    );
  }

  // Providers gate. The overlay is non-dismissible — the kanban renders
  // behind it but can't be interacted with until at least one provider is
  // configured. The initial auth flags are surfaced so a fresh install with
  // either Claude Code or codex-cli already signed in unblocks immediately
  // before the providers query resolves.
  const anyConfigured =
    providers?.anyConfigured ??
    (hasBridge ? initialClaudeAuthed || initialCodexAuthed : true);

  if (hasBridge && !anyConfigured) {
    return (
      <IssuesProvider>
        <ShellHost
          config={config ?? null}
          workspace={workspace}
          cloudWorkspace={cloudWorkspace}
        />
        <ProvidersOverlay
          reason={(providers?.providers ?? []).some((p) => p.lastError) ? 'all-failed' : 'none'}
          onConfigured={() => setProvidersTick((t) => t + 1)}
        />
      </IssuesProvider>
    );
  }

  return (
    <IssuesProvider>
      <ShellHost
        config={config ?? null}
        workspace={workspace}
        cloudWorkspace={cloudWorkspace}
      />
    </IssuesProvider>
  );
}

