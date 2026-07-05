import type { Recurrence } from "../types";
import { addDaysStr, parseDateStr, toDateStr, DOW_SHORT } from "./util";

export function parseRecurrence(s: string | null): Recurrence | null {
  if (!s) return null;
  try {
    const r = JSON.parse(s) as Recurrence;
    if (!r || typeof r !== "object" || !r.freq) return null;
    return r;
  } catch {
    return null;
  }
}

export function serializeRecurrence(r: Recurrence | null): string | null {
  return r ? JSON.stringify(r) : null;
}

export function describeRecurrence(r: Recurrence | null): string {
  if (!r) return "Never";
  switch (r.freq) {
    case "daily":
      return "Daily";
    case "weekdays":
      return "Weekdays";
    case "weekly": {
      const days = (r.days ?? []).slice().sort();
      if (days.length === 0) return "Weekly";
      return `Weekly · ${days.map((d) => DOW_SHORT[d]).join(", ")}`;
    }
    case "every_n_days":
      return `Every ${r.n ?? 2} days`;
    case "monthly":
      return "Monthly";
  }
}

/**
 * Next occurrence strictly after `fromStr` (yyyy-MM-dd).
 */
export function nextOccurrence(r: Recurrence, fromStr: string): string {
  switch (r.freq) {
    case "daily":
      return addDaysStr(fromStr, 1);
    case "weekdays": {
      let d = addDaysStr(fromStr, 1);
      while ([0, 6].includes(parseDateStr(d).getDay())) d = addDaysStr(d, 1);
      return d;
    }
    case "weekly": {
      const days = (r.days ?? []).slice().sort();
      if (days.length === 0) return addDaysStr(fromStr, 7);
      let d = addDaysStr(fromStr, 1);
      for (let i = 0; i < 8; i++) {
        if (days.includes(parseDateStr(d).getDay())) return d;
        d = addDaysStr(d, 1);
      }
      return d;
    }
    case "every_n_days":
      return addDaysStr(fromStr, Math.max(1, r.n ?? 2));
    case "monthly": {
      const from = parseDateStr(fromStr);
      const dayOfMonth = from.getDate();
      const next = new Date(from.getFullYear(), from.getMonth() + 1, 1);
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(dayOfMonth, lastDay));
      return toDateStr(next);
    }
  }
}
