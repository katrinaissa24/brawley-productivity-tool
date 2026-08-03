// Shared geometry for the time-grid calendars (Calendar page, Today's calendar).

import type { Project, Task } from "../types";
import { INBOX_COLOR } from "../stores/selectors";

/** Drag snap, in minutes. */
export const SNAP = 15;

export const snapRound = (m: number) => Math.round(m / SNAP) * SNAP;
export const snapFloor = (m: number) => Math.floor(m / SNAP) * SNAP;

/** Anything that occupies a span of the day and needs a column. */
export interface TimeSpan {
  key: string;
  start: number;
  dur: number;
}

/** Classic column-packing for overlapping events; returns col index + cluster width. */
export function layoutOverlaps(items: TimeSpan[]): Map<string, { col: number; cols: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const out = new Map<string, { col: number; cols: number }>();
  let colEnds: number[] = [];
  let members: string[] = [];
  const flush = () => {
    for (const k of members) out.get(k)!.cols = colEnds.length;
    colEnds = [];
    members = [];
  };
  for (const it of sorted) {
    if (members.length && colEnds.every((e) => e <= it.start)) flush();
    let col = colEnds.findIndex((e) => e <= it.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(0);
    }
    colEnds[col] = it.start + it.dur;
    out.set(it.key, { col, cols: 1 });
    members.push(it.key);
  }
  flush();
  return out;
}

/** #RRGGBB + alpha byte — soft pastel fill behind each event. */
export function tint(hex: string, dark: boolean): string {
  const a = dark ? "3d" : "26";
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${a}` : hex;
}

export function projectColorOf(
  task: Task | null,
  projects: Project[],
  fallback: string,
): string {
  if (!task) return fallback;
  if (!task.projectId) return INBOX_COLOR;
  return projects.find((p) => p.id === task.projectId)?.color ?? fallback;
}
