# Flow

A local-first macOS task manager built to kill overwhelm: capture instantly, see only
what matters today, run weekly sprints with a review ritual, and track dated goals with
clean charts. The full product spec lives in [SPEC.md](SPEC.md) — it is the source of
truth for every feature.

## Highlights

- **Quick capture** — `⌘⇧Space` from anywhere in macOS opens a floating capture bar;
  thoughts land in the Inbox in under 3 seconds
- **Drag-to-classify Inbox** — drag a note onto a project in the sidebar to turn it
  into a task
- **Today view** — hard-capped focus list (default 5) with a "Plan my day" morning flow
- **Projects** — board and list layouts, filters, WIP limits
- **Goals** — always dated, three progress modes (linked tasks / manual / milestones),
  burn-up chart, configurable deadline behavior
- **Sprints & Weekly Review** — one active sprint, backlog commit, and a six-step
  guided review that triages stale tasks, checks every goal, and plans the next sprint
- **Insights** — sprint doughnut, focus distribution, per-project completion, goal
  bars, completion trend
- **100% local** — a single SQLite file at `~/Library/Application Support/flow/flow.db`
  (reveal/export/import from Settings → Data). No accounts, no cloud, no telemetry.

## Stack

Tauri 2 (Rust) · React 18 + TypeScript + Vite · Tailwind CSS · Zustand · @dnd-kit ·
Recharts · SQLite via `tauri-plugin-sql` · date-fns

## Development

```sh
npm install          # frontend deps
npm run tauri dev    # full app (requires Rust toolchain: https://rustup.rs)
npm run dev          # browser-only preview (sql.js in IndexedDB instead of native SQLite)
npm run typecheck    # strict TS check
```

The browser preview exists for fast UI iteration; the real app always uses native
SQLite through the Tauri plugin. Native-only features (global shortcut, notifications,
backup export/import, reveal-in-Finder) no-op gracefully in the browser.

## Production build

```sh
npm run tauri build
```

Outputs `Flow.app` and a `.dmg` under `src-tauri/target/release/bundle/`.

## Project layout

```
src/
  types.ts          # typed models mirroring the DB schema
  db/               # SQL driver (Tauri plugin + sql.js fallback), migrations, repo
  stores/           # Zustand stores (data, settings, ui) + pure selectors
  lib/              # dates, recurrence, shortcuts, notifications, native bridge
  components/       # shared UI (cards, board, palette, modals, dnd wrappers)
  views/            # one file per screen (Inbox, Today, Sprint, Review, …)
src-tauri/          # Rust shell: commands, global shortcut, windows, bundling
  src/main.rs
  migrations → src/db/migrations/*.sql (run from the frontend, numbered, append-only)
scripts/gen-icon.mjs  # regenerates app-icon.png (then: npx tauri icon app-icon.png)
```

## Data & backups

- The database is one file: `~/Library/Application Support/flow/flow.db`
- Settings → Data → **Export backup** copies it with a timestamp; **Import backup**
  restores one (with confirmation) and relaunches
- Nothing is hard-deleted without an explicit, confirmed "Delete" — archive first
