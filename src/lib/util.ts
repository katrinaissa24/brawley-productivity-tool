import { format, addDays, differenceInCalendarDays, isSameYear } from "date-fns";
import type { Priority } from "../types";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** Local date as yyyy-MM-dd */
export function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function todayStr(): string {
  return toDateStr(new Date());
}

/** Local calendar date (yyyy-MM-dd) of a full ISO timestamp. */
export function localDateOf(iso: string): string {
  return toDateStr(new Date(iso));
}

/** Parse yyyy-MM-dd as local midnight */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysStr(s: string, n: number): string {
  return toDateStr(addDays(parseDateStr(s), n));
}

/** b - a in whole calendar days */
export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseDateStr(b), parseDateStr(a));
}

/** Days from today until date (negative = past) */
export function daysUntil(s: string): number {
  return daysBetween(todayStr(), s);
}

export function isBeforeToday(s: string): boolean {
  return daysUntil(s) < 0;
}

export function formatMinutes(min: number): string {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Parse "90", "90m", "1h", "1h30", "1h 30m", "1.5h" into minutes */
export function parseEstimate(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m = s.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m?)?$/);
  if (m) {
    const h = parseFloat(m[1]);
    const extra = m[2] ? parseInt(m[2], 10) : 0;
    return Math.round(h * 60 + extra);
  }
  m = s.match(/^(\d+)m?$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function formatDateShort(s: string): string {
  const d = parseDateStr(s);
  return isSameYear(d, new Date()) ? format(d, "MMM d") : format(d, "MMM d, yyyy");
}

export function relativeDayLabel(s: string): string {
  const diff = daysUntil(s);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = parseDateStr(s);
  if (diff > 1 && diff < 7) return format(d, "EEE");
  return formatDateShort(s);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

export function plural(n: number, word: string, pluralWord?: string): string {
  return `${n} ${n === 1 ? word : pluralWord ?? word + "s"}`;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };
  wrapped.flush = (...args: A) => {
    if (t) clearTimeout(t);
    t = null;
    fn(...args);
  };
  return wrapped;
}

/**
 * Subsequence fuzzy match. Returns a score (higher = better) or -1 for no match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      streak++;
      score += 1 + streak * 2;
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-" || t[ti - 1] === "_") {
        score += 8; // word-start bonus
      }
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return -1;
  return score - Math.floor(t.length / 8);
}

export const SORT_GAP = 1000;

export function nextSortOrder(items: { sortOrder: number }[]): number {
  if (items.length === 0) return SORT_GAP;
  return Math.max(...items.map((i) => i.sortOrder)) + SORT_GAP;
}

export function firstSortOrder(items: { sortOrder: number }[]): number {
  if (items.length === 0) return SORT_GAP;
  return Math.min(...items.map((i) => i.sortOrder)) - SORT_GAP;
}

/**
 * Move an item within an ordered list; returns [id, sortOrder] pairs for every
 * item whose sortOrder changed (full renumber keeps it simple and correct).
 */
export function reorderIds(orderedIds: string[], fromIndex: number, toIndex: number): { id: string; sortOrder: number }[] {
  const ids = [...orderedIds];
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, moved);
  return ids.map((id, i) => ({ id, sortOrder: (i + 1) * SORT_GAP }));
}

export function hexToTriple(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  return `${(num >> 16) & 255} ${(num >> 8) & 255} ${num & 255}`;
}

export const PROJECT_COLORS = [
  "#6366F1", // indigo
  "#3B82F6", // blue
  "#0EA5E9", // sky
  "#14B8A6", // teal
  "#22C55E", // green
  "#F59E0B", // amber
  "#F97316", // orange
  "#EF4444", // red
  "#EC4899", // pink
  "#8B5CF6", // violet
  "#64748B", // slate
  "#A16207", // bronze
];

export const ACCENT_COLORS: { name: string; hex: string }[] = [
  { name: "Indigo", hex: "#6366F1" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Violet", hex: "#8B5CF6" },
  { name: "Teal", hex: "#14B8A6" },
  { name: "Green", hex: "#22C55E" },
  { name: "Amber", hex: "#F59E0B" },
  { name: "Rose", hex: "#F43F5E" },
  { name: "Graphite", hex: "#64748B" },
];

export const PRIORITY_META: Record<Priority, { label: string; dot: string; chip: string }> = {
  P1: {
    label: "P1",
    dot: "bg-red-500",
    chip: "text-red-600 dark:text-red-400 bg-red-500/10",
  },
  P2: {
    label: "P2",
    dot: "bg-orange-500",
    chip: "text-orange-600 dark:text-orange-400 bg-orange-500/10",
  },
  P3: {
    label: "P3",
    dot: "bg-zinc-400",
    chip: "text-zinc-500 dark:text-zinc-400 bg-zinc-500/10",
  },
};

export const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
