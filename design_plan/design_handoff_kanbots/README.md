# Handoff: kanbots — Claude Code orchestrator

## Overview

**kanbots** is a desktop-first orchestrator for parallel Claude Code agents. The user works across multiple folders (codebases) inside a single workspace, each task runs in its own git worktree on a dedicated branch, and the kanban board is the primary surface for monitoring + steering many agents at once.

The defining product idea: cards are **agent-aware**. Running cards stream their current tool call live, expose `+/−` line counts, per-check status (tsc / tests / lint), and a branch-preview URL. Awaiting cards surface the agent's blocking question on the card face. Review cards expose Approve & merge / Request changes inline.

## About the Design Files

The files in `source/` are **design references created in HTML/React-via-Babel** — prototypes that show the intended look, layout, copy, and interaction model. They are **not** production code to copy directly.

Your job is to **recreate these designs in the target codebase's existing environment** (whatever framework, design system, and component library the project already uses). If the project is greenfield, choose the most appropriate stack for a desktop-class orchestrator UI — strong candidates are Tauri + React, Electron + React, or a native shell. The component decomposition shown here maps cleanly to React + a Linear/Things-style design system.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, copy, and interactions are settled. Recreate pixel-perfectly using the codebase's existing primitives. Every measurement and color value below is the canonical answer.

## Files in `source/`

| File | What it is |
|---|---|
| `kanbots.html` | Entry point — loads React + Babel + all .jsx files in order |
| `styles.css` | **The design system.** All tokens, components, layout, and modal styles. ~1100 lines. |
| `data.js` | Mock dataset — issues, columns, decisions, ticker events, diff |
| `app.jsx` | Root `<App>` — title bar, shell, board, modal coordination |
| `components.jsx` | `Card`, `Column`, `LeftRail`, `Palette`, `Tray`, `ICONS` |
| `inspector.jsx` | Right-side dock: Thread / Diff / Preview tabs for the selected issue |
| `task-detail-modal.jsx` | Full task detail modal (overlays the board) |
| `task-create-modal.jsx` | New-task modal with live preview-as-it-lands |
| `tweaks-panel.jsx` | Floating tweaks panel (theme, accent hue, layout toggles) |

Open `kanbots.html` in any modern browser to interact with the prototype.

---

## Design Tokens

All in `styles.css` under `:root[data-theme="dark"]`. Reproduce these as CSS variables, Tailwind theme tokens, or your design system's equivalent.

### Colors — surfaces (warm near-black, low chroma)

| Token | Value | Use |
|---|---|---|
| `--bg` | `oklch(0.165 0.008 60)` | App background |
| `--bg-1` | `oklch(0.195 0.009 60)` | Panel (rail, inspector) |
| `--bg-2` | `oklch(0.225 0.010 60)` | Card |
| `--bg-3` | `oklch(0.265 0.011 60)` | Elevated (selected segments, palette) |
| `--bg-inset` | `oklch(0.140 0.008 60)` | Code blocks, inset wells |
| `--hairline` | `oklch(0.305 0.011 60)` | Primary borders |
| `--hairline-soft` | `oklch(0.260 0.010 60)` | Subtle dividers |

### Colors — ink (text)

| Token | Value | Use |
|---|---|---|
| `--ink` | `oklch(0.965 0.008 80)` | Primary text |
| `--ink-1` | `oklch(0.870 0.009 80)` | Body text |
| `--ink-2` | `oklch(0.700 0.010 80)` | Secondary text |
| `--ink-3` | `oklch(0.560 0.010 80)` | Muted, labels |
| `--ink-4` | `oklch(0.430 0.010 60)` | Disabled, placeholders |

### Colors — accent + state (all share L≈0.74, c≈0.13–0.18)

| Token | Value | Use |
|---|---|---|
| `--accent` | `oklch(0.745 0.155 45)` | Clay/terracotta — primary brand |
| `--accent-soft` | `oklch(0.745 0.155 45 / 0.14)` | Tinted backgrounds |
| `--accent-line` | `oklch(0.745 0.155 45 / 0.45)` | Accent borders |
| `--running` | `oklch(0.745 0.155 45)` | = accent (intentional) |
| `--awaiting` | `oklch(0.78 0.14 75)` | Amber |
| `--review` | `oklch(0.78 0.13 155)` | Sage green |
| `--failed` | `oklch(0.70 0.18 25)` | Red-clay |
| `--queued` | `oklch(0.74 0.10 240)` | Slate-blue |
| `--idle` | `oklch(0.55 0.005 60)` | Neutral |
| `--add` | `oklch(0.78 0.13 155)` | Diff additions (= review) |
| `--del` | `oklch(0.70 0.18 25)` | Diff deletions (= failed) |

**Why oklch?** Equal-perceived-lightness across hues. Critical for the state pill family — running/awaiting/review/failed all read at the same visual weight even though they're different colors.

### Typography

```
--ff-sans:   'Inter Tight', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
--ff-mono:   'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
--ff-serif:  'Instrument Serif', 'Times New Roman', serif;  /* italic, used sparingly */
```

Type scale (no separate variables — used directly in CSS):

| Use | Size | Weight | Tracking | Notes |
|---|---|---|---|---|
| Card title | 13.5px | 500 | -0.005em | `text-wrap: pretty` |
| Column header | 11.5px | 600 | 0.10em | uppercase |
| Body text | 13px | 400 | 0 | line-height 1.55 |
| Muted label | 10.5–11px | 600 | 0.12em | uppercase, `--ink-3` |
| Modal h1 | 22px | 600 | -0.018em | text-wrap: balance |
| Mono inline | 11–12px | 400 | 0 | always `JetBrains Mono` |

### Spacing & radii

- **Radii:** Cards 9px, modals 14px, pills 6–7px, inputs 8px, chips 5–6px
- **Hairlines, not shadows.** Almost no drop-shadow. Borders + insets do the lifting. Modal scrim has the only large shadow: `0 32px 80px oklch(0 0 0 / 0.6)`.
- **Ambient glow** only on active agents: `box-shadow: 0 0 18px var(--running)` on a 2px left rail of a running card.

---

## Layout — Top Level

```
┌────────────────────────────────────────────────────────────────────┐
│ macOS title bar  ●●●  Anthropic stack / kanbots ⋅ main             │  48px
├──────────┬───────────────────────────────────────────┬─────────────┤
│          │  Crumbs · Board                  [+ New] │             │
│  Left    │  Filters: Open · Has agent · p0|p1 …     │  Inspector  │
│  rail    │  ────────────────────────────────────────│  dock       │
│  240px   │                                          │             │
│          │  ┌─Inbox─┐ ┌Backlog┐ ┌─Todo─┐ ┌In prog┐  │  380px      │
│          │  │ card  │ │ card  │ │ card │ │  CARD │  │             │
│          │  │       │ │       │ │      │ │ (run) │  │             │
│          │  └───────┘ └───────┘ └──────┘ └───────┘  │             │
└──────────┴───────────────────────────────────────────┴─────────────┘
                                       Decisions tray ↑ (bottom-right)
```

**Grid:** `grid-template-columns: 240px 1fr 380px;` with `min-height: 0;` on the middle column so the board scrolls horizontally.

**Inspector** is hideable via title-bar toggle (collapses to `1fr` for the center).

---

## Screens / Views

### 1. Kanban Board (root)

**Purpose:** primary monitoring surface. The user lives here.

**Title bar (macOS chrome):**
- Traffic lights left, breadcrumb center (`workspace · folder ⋅ branch`), sidebar/inspector toggles right
- Height 48px, draggable region (`-webkit-app-region: drag` if Electron/Tauri)
- Background slightly lighter than `--bg` to read as window chrome

**Left rail (240px wide):**
- **Workspace** card: 2-letter glyph in `--accent-soft` square, name, folder count, agent-count pulse if any are active
- **Folders** list: each folder shows path, branch (`mono`), and either an active-agent count (orange pulse dot) or static issue count
- **Views** list: Board / Swarm / Inbox / Decisions / Activity
- **Live agents** section: stacked mini-cards for every running/awaiting agent, color-coded by state (clay = running, amber = awaiting, sage = review). Click → focus that issue in the inspector.
- **Footer:** current user pill + `⌘K` button

**Center column:**
- **Toolbar row:** breadcrumbs left, search input + Filter + Group + `+ New task` right
- **Filter pills row:** active filters as pills with `×` to remove; on the right a stat line: `14 issues · 3 active runs · 2 awaiting · $7.42 today`
- **Board:** horizontally scrolling row of columns

**Columns** (widths flex; default ~280px each):
- Header: status dot (color-coded), label uppercase, count, `+` button on hover
- Cards stacked vertically with 8px gap
- Status dot color matches the column state (`--queued` for backlog, `--running` for in-progress, etc.)

**Cards** — the most important component:

```
┌────────────────────────────────────────┐
│ [feat] #412   kanbots          ● RUNNING│  ← state pill, top-right
│ Migrate auth flow to passkeys (WebAuthn)│  ← title (1.4 line-height)
│                                         │
│ ▶ Edit › apps/web/src/auth/passkey/…   │  ← live ticker (running only)
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  62%             │  ← progress bar (running only)
│                                         │
│ claude/passkey-auth                     │  ← branch pill (mono)
│ +612 −187 · 14 files · 30m              │  ← stats line
│ ✓ tsc  ⟳ tests  ✓ lint                  │  ← check pills
│                                         │
│ [J][R]                          30m ago │  ← avatars + age
└────────────────────────────────────────┘
```

- 2px left edge color matches state. Running has glow.
- Padding: 12px. Radius 9px. Background `--bg-2`.
- Selected card: `outline: 2px solid var(--accent)` + `outline-offset: -2px`.
- Hover: `--bg-3`.
- Awaiting cards swap the ticker for the **agent's question on the card face** in italic Instrument Serif, with reply-affordance underneath.
- Review cards swap stats for inline **Approve & merge / Request changes / Run reviewer agent** buttons.

### 2. Inspector dock (right column, 380px)

**Purpose:** detail-on-demand for the selected card without leaving the board.

- **Top bar:** `#issue · branch | ↗ Expand · Thread · Diff · Preview` tabs
- **Body:**
  - Title block (`#412` + h1)
  - Meta chips row: status pill, tag, labels, branch, model
  - **Run summary card:** 4-cell grid (Model / Elapsed / Tokens / Cost) with hairline borders
  - **Live event ticker:** stack of `tcall` rows (tool name + args + duration), monospace, capped height with auto-scroll
  - **Decision card** (if `agent === 'awaiting'`): the question rendered in Instrument Serif italic, numbered hotkey choices, "Reply..." textarea
  - **Tab content** below
- **↗ Expand** opens the **Task Detail Modal** (see below).

### 3. Command Palette (⌘K)

Centered overlay (560px wide), fixed at top 18%. Standard fuzzy-search list. Categories: Jump to issue · Spawn agent · Split task · Ask Claude (the last row uses serif italic to set it apart).

### 4. Decision Queue Tray (bottom-right floating)

Pinned drawer that lists every pending decision across every run. Each row: issue number, agent's question, two-button Approve/Reject. Resolves with two clicks max.

### 5. Tweaks Panel (toolbar toggle)

Floating bottom-right window. Tabs: Theme (Dark/Paper) · Accent hue slider · Inspector dock toggle · Decision tray toggle · "Try things" buttons (open palette, focus paused agent, focus review-ready PR).

### 6. Task Detail Modal — `task-detail-modal.jsx`

**Trigger:** double-click any card OR `↗ Expand` in the inspector.

**Shape:** centered modal, 1100px max-width, `max-height: calc(100vh - 80px)`. Scrim is `oklch(0 0 0 / 0.55)` with `backdrop-filter: blur(6px)`.

**Layout:**
```
┌── modal-head: kanbots · #412 · title …          [Stop] [Fork] [Open preview] [×] ──┐
├──────────────────────────────────────┬─────────────────────────────────────────────┤
│ HERO (linear gradient → accent-soft) │  Live run (4-stat grid)                     │
│   #412  Migrate auth flow…           │  Check pills: tsc, tests, lint              │
│   [● RUNNING · run #7821] [feat] …   │  ────────                                   │
├──────────────────────────────────────┤  Properties (Status, Assignee, Priority,    │
│ Tabs: Overview · Thread · Diff ·     │   Folder, Worktree, Branch, Base)           │
│       Preview · Runs                 │  ────────                                   │
├──────────────────────────────────────┤  Linked: #408 #388                          │
│ TAB CONTENT                          │                                             │
└──────────────────────────────────────┴─────────────────────────────────────────────┤
│  Reply to agent: [/spec to refine · /review · /split…              ]  [Send ⌘↵]   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Tabs:**
- **Overview** — Description (markdown), generated `/spec` block (acceptance criteria as checklist + "Files the agent expects to touch"), "What the agent did just now" (rich tool-call cards)
- **Thread** — message list: user / claude bubbles (claude bubble has accent-soft tint), with streaming tool-call card at the tail showing `● live`
- **Diff** — full diff renderer, file list with stat tags (added/modified/deleted), per-file hunks with `+/−` line markers
- **Preview** — embedded `localhost:3041 · branch` chrome over a placeholder canvas (real iframe sandbox in production)
- **Runs** — vertical timeline with colored markers (running/done/failed), each row: status, run id, summary, model, tokens, cost, duration

### 7. Task Create Modal — `task-create-modal.jsx`

**Trigger:** `+ New task` button OR press `N`.

**Shape:** same modal chrome as detail. Left = form. Right aside = **live preview of how the task will appear on the board** (re-renders on every keystroke).

**Form fields, in order:**

1. **Title** (`input.title-input`, 16px, autofocus). Below it, in mono, `branch will be → claude/<slug>` updates as the user types.
2. **Template** chips: Bug fix · Feature · Refactor · Review · Spike. Selected chip uses `--accent-soft` background.
3. **Description** (textarea, markdown, placeholder includes `AC:` example for acceptance criteria).
4. **How should this start?** — three big radio cards (this is the *one* decision that determines agent behavior on submit):
   - **Spec first** — run `/spec` to refine, wait for approval
   - **Create & dispatch** — spawn agent immediately
   - **Queue for later** — sit in Backlog
5. **Context** — folder picker + base branch picker (sub-grid of two `pill-select`s) + file scope chip row with `+ Add path`
6. **Agent** — assignee pill-select (claude auto / human manual) + model pill-select (opus / sonnet)
7. **Auto-run on each step** — checklist of tsc / tests / lint / e2e / preview (each row has bold name + small description)
8. **Labels** — Type segmented control (feat/fix/chore/infra/docs) + Priority segmented control (P0/P1/P2/P3)

**Right aside:**
- **How it'll appear** — section header (BACKLOG / AWAITING INPUT / IN PROGRESS based on mode) + a real `<Card>` rendered with the live form state
- **What runs** — numbered step list: `1. git worktree add → branch`, `2. claude /spec` or `claude code`, `3. pnpm dev` (if preview check on)

**Footer:** mode-specific hint left, `Cancel` + split-button submit right. Primary button label adapts: `Create & spec` / `Create & dispatch` / `Create task`. Cmd+Enter submits.

---

## Components — Spec Sheet

Reproduce these as actual components in the target framework. The HTML uses CSS classes; map them to your component primitives.

### `<Card issue={} selected onClick onOpen>`
- Props: issue object, selected bool, onClick (select), onOpen (double-click → detail modal)
- States: default, hover, selected, with-state-stripe (running/awaiting/review/failed)
- Animations: state pill `.px` element pulses (1.4s ease-in-out infinite, 0.6→1 opacity)

### `<Column status label issues selectedNum onSelect onOpen>`
- Renders header + sortable list of cards
- Empty state: dim em dash centered

### `<Inspector issue ticker diff onResolveDecision onExpand>`
- Tabs are local state
- Hides entirely when `tweaks.showInspector === false`

### `<TaskDetailModal issue onClose>`
- Mounts to body, fixed positioned. Esc closes. Click-scrim closes (stop propagation on inner modal).
- Internal tab state.

### `<TaskCreateModal onClose>`
- Form state: title, body, mode, template, folder, base, model, assignee, tag, priority, scope[], checks{}
- Computed `branchName` from title via slugify
- Esc closes. ⌘↵ submits.

### `<Palette open onClose>`
- Overlay with input row + categorized result list. Hardcoded categories for the prototype; in production wire to a fuzzy index.

### `<Tray decisions onJump>`
- Bottom-right pinned. Click an item → `onJump(issueNumber)`.

---

## Interactions & Behavior

| Action | Trigger | Result |
|---|---|---|
| Select card | Click | Highlight + populate inspector |
| Open detail | Double-click card OR `↗ Expand` | Open Task Detail Modal |
| Open create | `+ New task` button OR `N` key | Open Task Create Modal |
| Close modal | `Esc` OR click scrim OR `×` | Dismiss with `modal-in` reverse animation (currently just removes — fine to add fade-out) |
| Command palette | `⌘K` / `Ctrl+K` | Toggle palette |
| Resolve decision | Click choice in awaiting card | Card transitions to `running` lane |
| Toggle inspector | Title-bar inspector button | Collapse/expand right column |
| Toggle tweaks | Toolbar Tweaks toggle (host-provided) | Show/hide tweaks panel |
| Send reply | `⌘↵` in detail-modal footer | Append message to thread |

**Key handler must skip when typing:** the `N` shortcut is gated on `e.target.tagName !== 'INPUT'` and `!== 'TEXTAREA'`.

---

## State Management

For a real app, expect these slices:

- **Workspaces / Folders** — list, current selection, agent counts (derived)
- **Issues** — keyed by number; each has: status, agent ('idle'|'running'|'awaiting'|'review'|'failed'), tag, branch, runId, assignees, decision (if awaiting), checks{}, stats{}
- **Runs** — per-issue history; the *current* run is denormalized onto the issue for fast card rendering
- **Ticker events** — stream of tool calls for the live run (server-sent events / WebSocket in production)
- **Decisions** — derived: `issues.filter(i => i.agent === 'awaiting')`
- **UI state** — `selectedIssueNumber`, `paletteOpen`, `detailIssue`, `createOpen`, `tweaks{}`

**Hot path:** the ticker is a high-frequency stream. Render it with a fixed window (last N events) and key-off `event.id`. Don't re-render the whole card tree on every tick — derive `currentTickerLine` per-issue and memoize.

**Persistence:** `tweaks` lives in localStorage. Selection lives in URL hash (`#issue=412`). Modal open state is *not* persisted (refresh closes them).

---

## Assets

No external images. All iconography is inline SVG (see `ICONS` const in `components.jsx`). Avatars are letter-glyphs on colored backgrounds (deterministic hash-to-hue). Replace with real avatars where available.

If the target codebase has its own icon system (Lucide, Heroicons, etc.), substitute on a 1:1 basis — the names line up: search, plus, branch, folder, bot, inbox, flame, spark, layers, filter.

---

## Implementation Notes

1. **Start with the design tokens** — get all CSS variables into your design system before writing a single component. Cards won't look right without the warm-near-black surface scale.
2. **Build the Card first.** It carries the most product DNA. Once that feels right, the rest follows.
3. **Mock the live ticker early.** Use a `setInterval` that cycles through fake tool calls. The "agent is working right now" feeling is what makes this not-Trello — don't ship without it.
4. **Modals must stop event propagation** on the inner element so clicking the scrim doesn't fire on the modal body.
5. **The right aside in Create modal is a live `<Card>`** with the in-progress form data. Reuse the actual Card component — don't build a separate preview component.
6. **Don't use drop shadows** for elevation. Use hairlines and the surface scale (`--bg`, `--bg-1`, `--bg-2`, `--bg-3`). The only big shadow is the modal lift.

---

## Out of scope (deliberately)

- Real backend/wire format for runs and tickers
- Auth, user management
- Multi-window support
- Mobile / narrow viewports — this is a desktop tool, min-width ~1100px

These will need product decisions; the design assumes the orchestrator service exposes a streaming API per run and a CRUD API for issues/folders.
