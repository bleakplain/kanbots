import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { getBridge } from './desktop-bridge.js';
import type { ActiveWorkspaceInfo, RecentWorkspace } from './desktop-bridge.js';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/card.css';
import './styles/rail.css';
import './styles/inspector.css';
import './styles/modals.css';
import './styles/create-modal.css';
import './styles/tray.css';
import './styles/palette.css';
import './styles/tweaks.css';
import './styles.css';

document.documentElement.setAttribute('data-theme', 'dark');

window.addEventListener('unhandledrejection', (event) => {
  console.error('[renderer] unhandledRejection:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('[renderer] uncaughtError:', event.error ?? event.message);
});

async function bootstrap(): Promise<{
  workspace: ActiveWorkspaceInfo | null;
  recents: RecentWorkspace[];
  hasBridge: boolean;
  claudeAuthed: boolean;
}> {
  const bridge = getBridge();
  if (!bridge) {
    return { workspace: null, recents: [], hasBridge: false, claudeAuthed: true };
  }
  const payload = await bridge.bootstrap();
  return {
    workspace: payload.workspace,
    recents: payload.recents,
    hasBridge: true,
    claudeAuthed: payload.claudeAuthed,
  };
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('root element not found');
}
const root = createRoot(container);

void bootstrap().then(({ workspace, recents, hasBridge, claudeAuthed }) => {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App
          workspace={workspace}
          initialRecents={recents}
          hasBridge={hasBridge}
          initialClaudeAuthed={claudeAuthed}
        />
      </ErrorBoundary>
    </StrictMode>,
  );
});
