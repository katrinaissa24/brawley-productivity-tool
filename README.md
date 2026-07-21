# Flow

**A local-first macOS task manager that kills overwhelm.**

Capture thoughts the instant they hit you, see only what matters today, run
weekly sprints with a built-in review ritual, and track dated goals with
clean charts — all backed by a single SQLite file on your machine. No
accounts, no cloud, no telemetry.

The full product spec lives in [SPEC.md](SPEC.md).

## Features

- **Quick capture** — `⌘⇧Space` opens a floating capture bar from anywhere in
  macOS; a thought lands in your Inbox in under 3 seconds
- **Today** — a hard-capped focus list (default 5) with a "Plan my day"
  morning flow
- **Projects** — board and list views, filters, WIP limits
- **Goals** — always dated, with linked-task / manual / milestone progress
  tracking and a burn-up chart
- **Sprints & Weekly Review** — one active sprint at a time, plus a guided
  review that triages stale tasks, checks every goal, and plans the next
  sprint
- **Calendar** — a Notion-Calendar-style week view of your tasks: drag to
  create, move, and resize timed blocks, an all-day row for date-only tasks,
  and a per-project tray of unscheduled tasks you can drag onto the grid.
  Unfinished tasks roll forward overnight into a "Do later" group on Today
- **Insights** — sprint and project charts, focus distribution, completion
  trends
- **100% local** — everything lives in one SQLite file, exportable and
  restorable from Settings

## Stack

Tauri 2 (Rust) · React 18 + TypeScript + Vite · Tailwind CSS · Zustand ·
@dnd-kit · Recharts · SQLite

## Getting started

```sh
npm install          # install dependencies
npm run tauri dev    # run the full native app (requires the Rust toolchain: https://rustup.rs)
npm run dev          # browser-only preview, no Rust required
```

Build a production `.app` / `.dmg`:

```sh
npm run tauri build
```

## Updates

Flow updates itself. The installed app checks GitHub Releases on launch (and via
**Settings → General → Updates → Check now**), then downloads and installs any
newer signed build and restarts — no manual rebuild. Cutting a release is just
pushing a version tag; CI does the rest. See
[docs/RELEASING.md](docs/RELEASING.md) for the one-time signing-key setup and the
release steps.

## Data

Everything lives in one file: `~/Library/Application Support/flow/flow.db`.
Export or import a backup, or reveal it in Finder, from **Settings → Data**.
Nothing is hard-deleted without explicit confirmation — archive first.
