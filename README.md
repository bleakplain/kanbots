# kanbots

A desktop kanban for working with Claude Code agents on a project folder.

Open any git repository as a workspace and you get a kanban board for issues
(local, by default), an agent thread per issue, and the ability to start agents
that run in isolated git worktrees with live tool-call streaming, decision
prompts, and a built-in branch preview.

## Status

This is a development build. Launch via the desktop scripts; there is no CLI.

## Packages

| Package | Purpose |
| --- | --- |
| `@kanbots/core` | Domain types, GitHub client, `IssueSource` contract |
| `@kanbots/local-store` | SQLite + migrations, repos, workspace metadata, `LocalIssueSource` |
| `@kanbots/dispatcher` | Agent runtime — spawns and supervises `claude -p`, parses stream-json |
| `@kanbots/api` | HTTP API server (Express) + agent supervisor |
| `@kanbots/web` | React + Vite UI (board + issue detail) |
| `@kanbots/desktop` | Electron shell — workspace picker, in-process API, native folder dialog |

## Run it

Requires Node 20+, pnpm 10+, and `claude` on PATH for agent runs.

Install once:

```sh
pnpm install
```

Launch the desktop app:

```sh
pnpm desktop          # builds web + main, opens Electron
pnpm desktop:dev      # Vite hot-reload + Electron pointing at it
```

A workspace picker opens. Pick any folder that contains a git repository — the
app creates `.kanbots/` (db + config + worktrees dir) on first open and drops
straight into the kanban board.

## License

MIT
