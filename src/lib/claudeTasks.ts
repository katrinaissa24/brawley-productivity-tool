/**
 * The Brawley ⇄ Claude hand-off file.
 *
 * Assigning a task writes a plain-markdown block into a file inside a space.
 * Claude (running on the desktop, on its own schedule) opens the same file,
 * works the tasks, and edits the `Status` line + `Report` section. Nothing here
 * is a database — the markdown *is* the state, so both sides stay honest.
 */

export type ClaudeStatus = "assigned" | "in_progress" | "waiting_review" | "done" | "blocked";

export const CLAUDE_STATUSES: ClaudeStatus[] = [
  "assigned",
  "in_progress",
  "waiting_review",
  "done",
  "blocked",
];

/** What gets written into the file — human words, not enum names. */
export const STATUS_TEXT: Record<ClaudeStatus, string> = {
  assigned: "assigned",
  in_progress: "in progress",
  waiting_review: "waiting for review",
  done: "done",
  blocked: "blocked",
};

export const STATUS_LABEL: Record<ClaudeStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  waiting_review: "Waiting for review",
  done: "Done",
  blocked: "Blocked",
};

export const STATUS_STYLE: Record<ClaudeStatus, string> = {
  assigned: "bg-panel text-ink2 border-bord",
  in_progress: "bg-accent/12 text-accent border-accent/30",
  waiting_review: "bg-orange-500/12 text-orange-600 dark:text-orange-400 border-orange-500/30",
  done: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  blocked: "bg-red-500/12 text-red-600 dark:text-red-400 border-red-500/30",
};

export interface ClaudeTask {
  /** Stable within a parse — the `ID:` field, or `#index` as a fallback. */
  key: string;
  id: string | null;
  /** Brawley task id this came from, when it was assigned from a task. */
  sourceTaskId: string | null;
  title: string;
  status: ClaudeStatus;
  /** The literal status text in the file (Claude may write anything). */
  statusText: string;
  assignedAt: string | null;
  priority: string | null;
  due: string | null;
  details: string;
  report: string;
  /** Whole block including its heading, for round-tripping. */
  raw: string;
  /** Offsets of `raw` in the source file — how edits find their block again. */
  start: number;
  end: number;
}

export const CLAUDE_FILE_NAME = "Claude Tasks.md";

export const CLAUDE_FILE_TEMPLATE = `# Claude Tasks

<!--
  Hand-off file between Brawley (the app) and Claude (on this machine).

  Claude — how to work this file:
  1. Pick up every task whose Status is "assigned".
  2. Set its Status to "in progress" while you work on it.
  3. When you're finished, write what you did under "### Report" and set the
     Status to "waiting for review" (or "blocked" with a reason if you're stuck).
  4. Don't delete tasks — the app removes them once they're reviewed.

  Allowed Status values: assigned · in progress · waiting for review · done · blocked
-->

`;

/* --------------------------------- parsing --------------------------------- */

const STATUS_RE = /^[-*]\s*\**\s*status\s*\**\s*:\s*(.+?)\s*$/im;

function field(block: string, name: string): string | null {
  // Tolerant of how the bold lands — `- **Name:** v`, `- **Name**: v`, `- Name: v`.
  const re = new RegExp(`^[-*]\\s*\\**\\s*${name}\\s*\\**\\s*:\\s*(.+?)\\s*$`, "im");
  const m = block.match(re);
  return m ? m[1].replace(/^[*`\s]+|[*`\s]+$/g, "") || null : null;
}

export function normalizeStatus(text: string): ClaudeStatus {
  const t = text.toLowerCase().replace(/[*_`]/g, "").trim();
  if (/^(done|complete|completed|shipped)$/.test(t)) return "done";
  if (/^(blocked|stuck|needs help)$/.test(t)) return "blocked";
  if (/review/.test(t)) return "waiting_review";
  if (/(in[\s-]?progress|doing|working)/.test(t)) return "in_progress";
  return "assigned";
}

/** Pull one named `### Section` out of a task block. */
function section(block: string, name: string): string {
  const re = new RegExp(`^###\\s+${name}\\s*$([\\s\\S]*?)(?=^###\\s|$(?![\\s\\S]))`, "im");
  const m = block.match(re);
  return m ? m[1].replace(/^\s*\n/, "").replace(/\n?-{3,}\s*$/, "").trim() : "";
}

/** Everything before the first task heading — title, instructions, etc. */
export function preambleOf(md: string): string {
  const i = md.search(/^##\s+/m);
  return i === -1 ? md : md.slice(0, i);
}

export function parseClaudeTasks(md: string): ClaudeTask[] {
  const re = /^##\s+.*$/gm;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) starts.push(m.index);

  return starts.map((start, i) => {
    const end = starts[i + 1] ?? md.length;
    const raw = md.slice(start, end);
    const title = (raw.match(/^##\s+(.*)$/m)?.[1] ?? "Untitled").trim();
    const statusText = raw.match(STATUS_RE)?.[1].replace(/[*_`]/g, "").trim() ?? "assigned";
    const id = field(raw, "ID");
    return {
      key: id ?? `#${i}`,
      id,
      sourceTaskId: field(raw, "Brawley task"),
      title,
      status: normalizeStatus(statusText),
      statusText,
      assignedAt: field(raw, "Assigned"),
      priority: field(raw, "Priority"),
      due: field(raw, "Due"),
      details: section(raw, "Details"),
      report: section(raw, "Report"),
      raw,
      start,
      end,
    };
  });
}

/* -------------------------------- rewriting -------------------------------- */

/** Replace one task's block, matched by key, and return the new file text. */
function replaceBlock(md: string, key: string, next: (block: string) => string): string {
  const target = parseClaudeTasks(md).find((t) => t.key === key);
  if (!target) return md;
  const out = md.slice(0, target.start) + next(target.raw) + md.slice(target.end);
  return out.replace(/\n{4,}/g, "\n\n\n");
}

export function setTaskStatus(md: string, key: string, status: ClaudeStatus): string {
  return replaceBlock(md, key, (block) => {
    const line = `- **Status:** ${STATUS_TEXT[status]}`;
    if (STATUS_RE.test(block)) return block.replace(STATUS_RE, line);
    // No status line yet (hand-written block) — put one right under the heading.
    return block.replace(/^(##\s+.*$)/m, `$1\n${line}`);
  });
}

export function removeTask(md: string, key: string): string {
  return replaceBlock(md, key, () => "");
}

export interface AssignInput {
  title: string;
  details?: string | null;
  priority?: string | null;
  due?: string | null;
  sourceTaskId?: string | null;
  /** Injected so callers stay testable; defaults to now. */
  now?: Date;
}

function stamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function renderTaskBlock(input: AssignInput): string {
  const now = input.now ?? new Date();
  const lines = [
    `## ${input.title.trim() || "Untitled task"}`,
    ``,
    `- **Status:** ${STATUS_TEXT.assigned}`,
  ];
  if (input.priority) lines.push(`- **Priority:** ${input.priority}`);
  if (input.due) lines.push(`- **Due:** ${input.due}`);
  lines.push(`- **Assigned:** ${stamp(now)}`);
  if (input.sourceTaskId) lines.push(`- **Brawley task:** ${input.sourceTaskId}`);
  lines.push(`- **ID:** ${newId()}`);
  lines.push(
    ``,
    `### Details`,
    ``,
    (input.details ?? "").trim() || "_No extra detail — use your judgement._",
    ``,
    `### Report`,
    ``,
    `_Claude: write what you did here._`,
    ``,
    `---`,
    ``,
  );
  return lines.join("\n");
}

/** Append a task block to the file, creating the header when it's empty. */
export function appendTask(md: string, input: AssignInput): string {
  const base = md.trim() ? md.replace(/\s*$/, "\n\n") : CLAUDE_FILE_TEMPLATE;
  return `${base}${renderTaskBlock(input)}`;
}
