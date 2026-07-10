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

## Data

Everything lives in one file: `~/Library/Application Support/flow/flow.db`.
Export or import a backup, or reveal it in Finder, from **Settings → Data**.
Nothing is hard-deleted without explicit confirmation — archive first.

## Updates

**In the app:** **Settings → Updates → Check now** asks GitHub for the latest
release. If a newer version exists, it shows the release notes and a **Download**
button that opens the `.dmg` — open it and drag Flow into Applications. Your
database is separate from the app bundle, so updating never touches your data.

**Publishing an update (maintainer):**

1. Bump the version in **three** places so they match: `package.json`,
   `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Commit, then tag and push:
   ```sh
   git tag v0.1.1 && git push origin v0.1.1
   ```
3. The **Release** GitHub Action ([.github/workflows/release.yml](.github/workflows/release.yml))
   builds a universal macOS `.dmg` and publishes it as a GitHub Release. Once
   it finishes, everyone's **Check for updates** will find it.

> The `.dmg` is unsigned, so on first launch macOS may need a right-click →
> **Open** to bypass Gatekeeper (same as a local `npm run tauri build`). For a
> fully seamless in-app auto-updater (download + install + relaunch), Flow would
> need signing keys and the Tauri updater plugin — a future enhancement.
