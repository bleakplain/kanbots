import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { configureApi } from './api.js';
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

async function bootstrap(): Promise<{
  workspace: ActiveWorkspaceInfo | null;
  recents: RecentWorkspace[];
  hasBridge: boolean;
}> {
  const bridge = getBridge();
  if (!bridge) {
    configureApi('');
    return { workspace: null, recents: [], hasBridge: false };
  }
  const payload = await bridge.bootstrap();
  configureApi(payload.apiBaseUrl);
  return {
    workspace: payload.workspace,
    recents: payload.recents,
    hasBridge: true,
  };
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('root element not found');
}
const root = createRoot(container);

void bootstrap().then(({ workspace, recents, hasBridge }) => {
  root.render(
    <StrictMode>
      <App workspace={workspace} initialRecents={recents} hasBridge={hasBridge} />
    </StrictMode>,
  );
});
