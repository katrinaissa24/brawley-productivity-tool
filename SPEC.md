# FLOW — The Ultimate Personal Task Manager (macOS)

> **Instruction file for Claude Code.** Build this app A→Z following the phases at the bottom. Read the entire spec before writing any code. Keep this file in the repo root and treat it as the source of truth for every session.

---

## 1. Product Vision

**The problem:** The user works across many projects (startups, personal growth, learning). Tasks get lost in a never-ending mental list. Holding it all in working memory is impossible, so the sheer volume becomes overwhelming — and overwhelm leads to doing *nothing*.

**The solution:** A local-first macOS task manager that:
- Gets tasks **out of the user's head instantly** (zero-friction capture)
- Shows **only what matters today** (a hard-capped Today view)
- Organizes everything by **user-created projects** (work, learning, personal growth)
- Tracks progress toward **dated goals** (e.g., "Score 100 on the exam by June 20")
- Runs on **weekly sprints** with a **weekly review ritual** that keeps goals on track
- Visualizes progress with **clean charts** (doughnut for sprint/project progress, pie for focus distribution)

**The anti-goal:** This app must never *recreate* overwhelm. Every screen should reduce cognitive load, not add to it.

---

## 2. Design Language (non-negotiable)

The UI must feel like a professional tool a startup or corporate team would use daily. Think **Slack, Notion, Linear — YC-startup polish**. Clean, intuitive, smooth, nothing funky.

- **Minimal & calm:** generous whitespace, restrained color, one accent color (user-changeable in Settings)
- **Typography:** system font (SF Pro via `-apple-system`), clear hierarchy, no decorative fonts
- **Layout:** left sidebar navigation (like Slack/Notion) + main content area
- **Cards:** tasks are cards — subtle borders/shadows, rounded corners (8–10px), smooth hover states
- **Motion:** subtle, fast transitions (150–200ms). Drag-and-drop must feel fluid with clear drop indicators
- **Dark mode + light mode**, following macOS system preference by default (overridable in Settings)
- **Keyboard-first:** every core action has a shortcut (see §12)
- **Empty states:** friendly, instructive, never blank (e.g., empty Inbox says "Brain empty. Nice." with a hint on the capture shortcut)
- No gradients-everywhere, no emoji-heavy UI, no gamification confetti. Professional and quiet.

---

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** | Native macOS app, ~10MB, fast startup, native notification access |
| Frontend | **React 18 + TypeScript + Vite** | Reliable, well-supported |
| Styling | **Tailwind CSS** | Fast iteration, consistent design tokens |
| State | **Zustand** | Simple global state |
| Drag & drop | **@dnd-kit** | Smooth, accessible DnD for cards and inbox sorting |
| Charts | **Recharts** | Doughnut + pie charts |
| Database | **SQLite** via `tauri-plugin-sql` | Local single-file DB, easy backup |
| Notifications | `tauri-plugin-notification` | Native macOS notifications |
| Dates | **date-fns** | Lightweight date handling |

**Data location:** SQLite file in the app data dir (`~/Library/Application Support/flow/flow.db`). Add a Settings action: "Reveal database in Finder" and "Export backup" (copies the .db with a timestamp).

**Fallback:** If Tauri build issues become blocking, switch to Electron with the same frontend — but attempt Tauri first.

---

## 4. Data Model (SQLite)

All tables use `id TEXT PRIMARY KEY` (UUID v4), `created_at` / `updated_at` ISO timestamps. Soft-delete via `archived_at` where noted.

### `projects`
| column | type | notes |
|---|---|---|
| name | TEXT | required |
| color | TEXT | hex, from a preset palette |
| icon | TEXT | optional emoji or SF-symbol-style key |
| sort_order | INTEGER | manual ordering in sidebar |
| archived_at | TEXT NULL | archived projects hidden from sidebar (viewable in Settings → Archive) |

### `goals`
| column | type | notes |
|---|---|---|
| project_id | TEXT FK | goals belong to a project |
| title | TEXT | e.g., "Score 100 on the exam" |
| description | TEXT NULL | |
| target_date | TEXT | required — goals are always dated |
| progress_mode | TEXT | `'auto_tasks'` (% of linked tasks done) \| `'manual'` (user slider 0–100) \| `'milestones'` (checklist of milestones) — per-goal, default from Settings |
| manual_progress | INTEGER | 0–100, used when mode = manual |
| status | TEXT | `'active'` \| `'completed'` \| `'missed'` \| `'archived'` |
| deadline_behavior | TEXT | `'ask'` \| `'auto_extend'` \| `'auto_missed'` \| `'auto_archive'` — default from Settings |

A goal **can exist with zero tasks** — tasks get linked later.

### `milestones`
`goal_id FK, title, done BOOLEAN, sort_order` — used when a goal's progress_mode = milestones.

### `tasks`
| column | type | notes |
|---|---|---|
| project_id | TEXT FK NULL | NULL = still in Inbox |
| goal_id | TEXT FK NULL | optional link to a goal |
| sprint_id | TEXT FK NULL | committed to a sprint |
| title | TEXT | required |
| notes | TEXT NULL | markdown body |
| status | TEXT | see §6 status pipeline (configurable) |
| priority | TEXT | `'P1'` \| `'P2'` \| `'P3'` \| NULL |
| due_date | TEXT NULL | hard deadline |
| do_date | TEXT NULL | the day the user *plans* to work on it — this is what drives the Today view |
| estimate_minutes | INTEGER NULL | time estimate |
| recurrence | TEXT NULL | RRULE-lite string, see §6 |
| sort_order | INTEGER | manual rank within lists |
| completed_at | TEXT NULL | **critical — powers all charts** |
| archived_at | TEXT NULL | |

### `subtasks`
`task_id FK, title, done BOOLEAN, sort_order`

### `sprints`
| column | type | notes |
|---|---|---|
| start_date / end_date | TEXT | duration from Settings (default 7 days) |
| status | TEXT | `'active'` \| `'completed'` |
| review_completed_at | TEXT NULL | set when the weekly review is done |

Exactly one active sprint at a time. When a sprint ends, the review flow closes it and creates the next one.

### `reviews`
`sprint_id FK, reflections TEXT (markdown), goals_snapshot TEXT (JSON of goal progress at review time), created_at`

### `settings`
Single-row key/value JSON store. See §11 for every key.

---

## 5. App Layout & Navigation

**Left sidebar (Slack/Notion style):**
1. 🔍 Search (⌘K command palette)
2. **Inbox** (badge = unsorted count)
3. **Today**
4. **Sprint** (current sprint board)
5. **Review** (badge/dot when a review is due)
6. **Insights** (charts)
7. Divider
8. **Projects** list (user-ordered, colored dot per project, drag to reorder) + "New project" button
9. Bottom: Settings gear

**Main area** renders the selected view. Persistent **quick-capture bar** behavior described in §6.1.

---

## 6. Features — Detailed Specs

### 6.1 Quick Capture / Inbox (the brain-dump system) — TOP PRIORITY FEATURE
The core promise: getting a thought out of your head takes **under 3 seconds**.

- **Global shortcut** (default `⌘⇧Space`, configurable): opens a floating capture bar (Spotlight-style) from anywhere in macOS, even when the app is in background. Type → Enter → note saved to Inbox → bar closes. No other fields.
- **In-app capture bar:** pinned at the top of the Inbox view; `⌘N` focuses it from any view.
- Items land in the **Inbox** as raw **notes** (tasks with `project_id = NULL`, no priority, no dates).
- **Sorting the inbox (drag-to-classify):** the Inbox view shows note cards in a column; the sidebar's project list acts as drop targets. **Dragging a note onto a project converts it into a task** for that project. On drop, show a small inline popover (optional, dismissible with Esc) offering priority / due date / goal link — all skippable.
- Alternate flow: click a note → lightweight detail panel → assign project/priority/dates there.
- Inbox items older than N days (Settings, default 7) get a subtle "aging" indicator — a nudge to sort or delete.

### 6.2 Tasks & Task Cards
- **Task card shows:** title, project color dot, priority chip (P1 red / P2 orange / P3 gray), due-date chip (turns red when overdue), estimate chip, subtask progress (e.g., `2/5`), goal icon if linked.
- **Click a card** → detail panel (right-side slide-over, like Linear): edit everything — title, notes (markdown), project, goal, priority, status, due date, do date, estimate, recurrence, subtasks checklist.
- **Status pipeline (personalizable):** default `To Do → In Progress → Done`. Settings toggle adds a `Blocked` state. Statuses render as columns in board views and as a status chip elsewhere.
- **WIP limit (personalizable):** default max **2** tasks "In Progress" at once. Attempting to exceed shows a gentle blocker: "You already have 2 tasks in progress — finish or pause one first." Limit and on/off toggle in Settings.
- **Subtasks:** simple checklist inside the detail panel; completing all subtasks prompts "Mark task done?"
- **Recurring tasks:** recurrence options — daily / weekdays / weekly (pick days) / every N days / monthly. On completion, the app immediately creates the next occurrence with shifted do/due dates. Great for "study 1 hour daily."
- **Due date vs Do date:** due = deadline; do = planned work day. UI labels these clearly. The Today view keys off **do date**; overdue warnings key off **due date**.
- **Time estimates:** optional minutes/hours per task. Views that list tasks show a **total workload header** (e.g., "Today: 5 tasks · ~4h 30m") — the reality check.
- Right-click context menu on any card: Move to project, Set priority, Do today, Complete, Archive, Delete.

### 6.3 Today View (focus mode)
- Shows tasks whose **do date = today**, plus anything the user manually pulls in.
- **Hard cap (personalizable):** default **5** visible tasks (range 3–10 in Settings). If more qualify, the rest collapse under a folded "Later today" section — deliberately out of sight.
- **"Plan my day" morning flow:** first time Today is opened each day (or via button), show a picker of candidates — overdue tasks, tasks due soon, high-priority sprint tasks — and the user selects up to the cap. Auto-suggest ranking: overdue due-date first, then P1 → P3, then oldest.
- Completing a task animates it out (fast, subtle). When the last Today task completes: calm "Day cleared" state with today's stats (tasks done, time estimated vs. actual count).
- Header shows total estimated time for the day.

### 6.4 Projects & Project View
- Create project: name + color (preset palette) + optional icon.
- **Project view** (click a project in sidebar), two toggleable layouts:
  - **Board:** columns per status, drag cards between columns
  - **List:** grouped by status or priority (toggle), sortable
- Project header: name, doughnut chart of task completion (done / total non-archived), active goals with progress bars, total open estimate.
- Filter bar: by priority, goal, status, has-due-date.
- Archive project (with confirm) → hides from sidebar, tasks preserved.

### 6.5 Goals
- Created **inside a project**: title, description, **target date (required)**, progress mode.
- **Progress modes (per-goal, default set in Settings):**
  1. `auto_tasks` — % of linked tasks completed
  2. `manual` — user-controlled 0–100 slider
  3. `milestones` — checklist of milestones; progress = % milestones done
- Goals render as a card with: title, progress ring, days-remaining countdown (turns orange ≤7 days, red ≤2 days), linked-task count.
- **Linking tasks:** from a task's detail panel (goal dropdown), or from the goal's page ("Add task" creates a pre-linked task).
- **Goal page:** progress ring, countdown, description, milestones (if any), all linked tasks (add/complete inline), mini burn-up of tasks completed over time.
- **Deadline passes — behavior is user-determined.** Per Settings (`goal_deadline_behavior`):
  - `ask` (default): dialog — "Goal '…' reached its target date at X% — Extend / Mark Missed / Archive"
  - `auto_extend` (prompt for new date), `auto_missed`, `auto_archive`
- Goals can exist **with zero tasks** — show an empty state prompting to add the first task.

### 6.6 Sprints
- **Sprint length is a Setting** (default **7 days**; options 1–4 weeks, or custom days). Sprint start day-of-week also configurable (default Monday).
- One **active sprint** at all times. Sprint view = board of tasks committed to the sprint (drag from a backlog panel of all open tasks, filterable by project/priority).
- Sprint header: name (auto: "Sprint · Mar 3–9"), days remaining, **doughnut chart** of sprint completion (done vs committed), total committed estimate.
- When end date arrives: sprint is marked "ready for review" → banner + sidebar badge → Weekly Review flow (§6.7) closes it and spins up the next sprint. Incomplete tasks: user chooses per-task (or bulk) — roll over to next sprint / back to backlog / archive.

### 6.7 Weekly Review (the check-in ritual)
A guided, multi-step flow — directly tied to goals, tasks, and sprint progress. Its job: make sure the user is **actively on track** for their goals.

**Trigger:** sprint end date reached (banner + native notification + sidebar dot). Can also be run manually anytime.

**Steps (wizard UI, one screen per step, progress dots at top):**
1. **Sprint recap:** doughnut of completed vs committed, total tasks done, estimated time completed. One-line auto summary ("You completed 8 of 12 committed tasks").
2. **Stale task triage:** list every open task untouched for > N days (Settings, default 14). For each: **Do** (add to next sprint) / **Defer** (clear do-date, keep in backlog) / **Delete**. This kills the rotting list.
3. **Goal check-in:** every active goal with its progress + days remaining. For each, user marks: `On track` / `At risk` / `Off track`, with an optional note. Goals with a passed target date trigger the deadline behavior here if unresolved.
4. **Reflection (optional, skippable):** free markdown — "What worked? What didn't?"
5. **Plan next sprint:** pick tasks for the new sprint (backlog picker, prioritized suggestions: at-risk goal tasks first, then P1s, then near-due). Shows running total of committed estimate vs. a soft capacity hint (Settings, default 20h).
6. **Done:** closes old sprint, creates new one, saves a `reviews` row with a goals snapshot. Calm completion screen.

Past reviews browsable from the Review tab (read-only history).

### 6.8 Insights (charts)
Clean, minimal Recharts visuals. Time-range selector: This sprint / Last sprint / 30 days / All time.
1. **Sprint progress doughnut** — done vs remaining in the active sprint
2. **Focus distribution pie** — completed tasks (or completed estimated-minutes, toggle) **per project** in the range → "which project has most of my focus"
3. **Per-project completion doughnuts** — small multiples grid
4. **Goal progress bars** — all active goals, sorted by nearest target date
5. **Completion trend** — bar chart of tasks completed per day over the range
All powered by `completed_at` timestamps.

### 6.9 Archive & History
- Completed tasks auto-move out of active views after N days (Settings, default: immediately on Done for boards; Today shows them till midnight).
- Archive page (Settings → Archive): searchable list of archived/completed tasks, archived projects, past goals. Everything restorable. Nothing is ever hard-deleted except explicit "Delete" (with confirm).

### 6.10 Notifications (native macOS)
Via Tauri notification plugin, each toggleable in Settings:
- **Morning planning nudge** (default 9:00, time configurable): "Plan your day — pick your Today tasks"
- **Due-date reminders:** day-before and morning-of a due date
- **Sprint review ready:** when sprint ends
- **Goal countdown:** 7 days and 1 day before a goal's target date
- Master toggle to silence everything.

### 6.11 Search & Command Palette
- `⌘K` opens a command palette (Linear-style): fuzzy search across tasks, projects, goals; quick actions ("New task", "Go to Today", "Start review").
- Enter on a task result opens its detail panel.

---

## 7. Settings (customization is a core feature)

The user explicitly wants the app **as personalizable as possible**. Settings is a first-class view with grouped sections. Every default below must be changeable:

**General**
- Theme: System / Light / Dark
- Accent color
- Sprint length (days; default 7) & sprint start day (default Monday)

**Tasks**
- Status pipeline: enable/disable `Blocked` state
- WIP limit: on/off + number (default 2)
- Default priority for new tasks (default: none)
- Stale-task threshold in days (default 14)
- Inbox aging indicator threshold (default 7 days)

**Today**
- Today view cap (3–10, default 5)
- "Plan my day" prompt: on/off

**Goals**
- Default progress mode (auto_tasks / manual / milestones; default auto_tasks)
- Deadline behavior (ask / auto_extend / auto_missed / auto_archive; default ask)

**Review**
- Sprint capacity hint (hours, default 20)
- Reflection step: on/off

**Notifications** — every notification type individually + master toggle + morning nudge time

**Shortcuts** — remap global capture + in-app shortcuts

**Data**
- Reveal database in Finder
- Export backup (.db copy with timestamp)
- Import backup (with confirm/overwrite warning)
- Archive browser

---

## 8. Keyboard Shortcuts (defaults)

| Shortcut | Action |
|---|---|
| `⌘⇧Space` | Global quick capture (system-wide) |
| `⌘N` | New task / focus capture bar |
| `⌘K` | Command palette / search |
| `⌘1…6` | Jump to Inbox / Today / Sprint / Review / Insights / first project |
| `⌘Enter` | Complete selected task |
| `E` | Edit selected task |
| `⌘,` | Settings |
| `Esc` | Close panel/popover |

---

## 9. Build Phases (execute in order — each phase must run and be usable before starting the next)

### Phase 1 — Foundation & Core Loop
Scaffold Tauri 2 + React + TS + Tailwind + SQLite (migrations system). App shell: sidebar + routing + light/dark theme. Projects CRUD. Tasks CRUD with detail panel (title, notes, project, priority, status, due/do dates, estimate, subtasks). Inbox with in-app capture bar + drag-note-onto-project-to-classify. Today view with cap + manual picking + complete animation. Project view (board + list).
**Exit criteria:** the user can capture, sort, prioritize, and complete real tasks daily.

### Phase 2 — Goals & Sprints
Goals CRUD (all 3 progress modes, milestones, deadline behaviors). Goal page. Task↔goal linking. Sprint system: active sprint, commit/drag tasks, sprint board, sprint header doughnut. Sprint rollover handling.

### Phase 3 — Rituals & Insights
Weekly Review wizard (all 6 steps) + review history. Insights view (all 5 charts). Archive & history page. WIP limits enforcement. Recurring tasks.

### Phase 4 — Polish & Native
Global capture shortcut (system-wide). Native macOS notifications (all types). Command palette (⌘K). Full Settings view wiring every option in §7. Keyboard shortcuts + remapping. Backup export/import. Empty states, animations pass, dark-mode audit, app icon, production build (.dmg).

---

## 10. Non-Goals (do NOT build)
- No calendar interface
- No accounts, auth, cloud sync, or servers — 100% local
- No collaboration/sharing features
- No mobile version
- No gamification (points, streaks, confetti)
- No AI features in v1

---

## 11. Engineering Notes for Claude Code
- TypeScript strict mode; typed models mirroring the DB schema in one `src/types.ts`
- SQLite migrations in numbered files; never mutate old migrations
- All list reordering persists via `sort_order`
- Every destructive action gets a confirm dialog; archive > delete wherever possible
- Optimistic UI updates with rollback on DB error
- Keep components small; views in `src/views/`, shared UI in `src/components/`
- Test with seeded demo data (script to insert 3 projects, 2 goals, 25 tasks) but ship with a clean first-run experience: a short 3-step onboarding (create first project → capture first note → drag it in)
