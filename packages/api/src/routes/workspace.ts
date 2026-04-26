import type { Store } from '@kanbots/local-store';
import { Router } from 'express';
import { z } from 'zod';
import { bootstrapWorkspace } from '../workspace-bootstrap.js';
import type { ConfigPayload } from './config.js';

export interface WorkspaceRoutesDeps {
  store: Store;
  config: ConfigPayload;
}

export interface WorkspacePayload {
  id: string;
  name: string;
  currentFolderId: string;
}

export interface FolderPayload {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  defaultBranch: string;
  addedAt: string;
  current: boolean;
  // Per-folder activity is computed from issues; the web rolls these up
  // from useIssues itself for now.
}

const addFolderSchema = z
  .object({
    name: z.string().min(1).max(120),
    path: z.string().min(1).max(2048),
    defaultBranch: z.string().min(1).max(120).optional(),
  })
  .strict();

export function workspaceRouter(deps: WorkspaceRoutesDeps): Router {
  const router = Router();

  router.get('/workspace', (_req, res) => {
    if (!deps.config.repoPath) {
      res.json({ id: 'default', name: 'kanbots workspace', currentFolderId: 'unknown' });
      return;
    }
    const { workspace, currentFolder } = bootstrapWorkspace(
      deps.store,
      deps.config,
      deps.config.repoPath,
    );
    const payload: WorkspacePayload = {
      id: workspace.id,
      name: workspace.name,
      currentFolderId: currentFolder.id,
    };
    res.json(payload);
  });

  router.get('/folders', (_req, res) => {
    if (!deps.config.repoPath) {
      res.json([]);
      return;
    }
    const { workspace, currentFolder } = bootstrapWorkspace(
      deps.store,
      deps.config,
      deps.config.repoPath,
    );
    const rows = deps.store.folders.listByWorkspace(workspace.id);
    const out: FolderPayload[] = rows.map((f) => ({
      id: f.id,
      workspaceId: f.workspaceId,
      name: f.name,
      path: f.path,
      defaultBranch: f.defaultBranch,
      addedAt: f.addedAt,
      current: f.id === currentFolder.id,
    }));
    res.json(out);
  });

  router.post('/folders', (req, res) => {
    const parsed = addFolderSchema.parse(req.body);
    if (!deps.config.repoPath) {
      res.status(400).json({ error: 'BadRequest', message: 'host has no active workspace' });
      return;
    }
    const { workspace } = bootstrapWorkspace(deps.store, deps.config, deps.config.repoPath);
    const id = `manual-${Date.now()}`;
    const folder = deps.store.folders.ensure({
      id,
      workspaceId: workspace.id,
      name: parsed.name,
      path: parsed.path,
      ...(parsed.defaultBranch !== undefined ? { defaultBranch: parsed.defaultBranch } : {}),
    });
    res.status(201).json({
      id: folder.id,
      workspaceId: folder.workspaceId,
      name: folder.name,
      path: folder.path,
      defaultBranch: folder.defaultBranch,
      addedAt: folder.addedAt,
      current: false,
    } satisfies FolderPayload);
  });

  return router;
}
