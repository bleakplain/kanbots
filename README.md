# kanbots

Local collaboration interface for working on GitHub Issues with Claude Code agents.

GitHub stays the source of truth for issues. kanbots adds a local web app and a Claude Code plugin that give each issue an agent thread, structured decision cards, diff proposals, and a kanban board — none of which github.com can offer because it can't run code on your laptop.

## Status

Phase 0 — workspace skeleton. See `docs/architecture.md` (forthcoming) for the full plan.

## Packages

| Package | Purpose |
| --- | --- |
| `@kanbots/core` | GitHub client, sync, label conventions |
| `@kanbots/local-store` | SQLite + migrations |
| `@kanbots/dispatcher` | Agent runtime — spawns and supervises `claude -p` |
| `@kanbots/api` | HTTP API server |
| `@kanbots/mcp` | Stdio MCP server |
| `@kanbots/web` | Vite UI (board + issue detail) |
| `@kanbots/cli` | The `kanbots` command |

## Development

```sh
pnpm install
pnpm -r build
```

Requires Node 20+ and pnpm 10+.

## License

MIT
