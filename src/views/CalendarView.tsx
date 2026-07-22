import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { Project, Task } from "../types";
import { useData } from "../stores/data";
import { isDark, useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import {
  activeProjects,
  CAL_INBOX_KEY,
  calendarActiveKey,
  INBOX_COLOR,
  unscheduledTasks,
  visibleTasks,
} from "../stores/selectors";
import {
  clamp,
  cn,
  formatClock,
  formatMinutes,
  formatTimeRange,
  minutesToHM,
  parseDateStr,
  parseHM,
  PRIORITY_META,
  relativeDayLabel,
  toDateStr,
  todayStr,
} from "../lib/util";
import { taskMenuItems } from "../components/TaskCard";
import { Button, FloatingMenu, Segmented } from "../components/ui/primitives";
import {
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconX,
} from "../components/icons";

/* -------------------------------- geometry -------------------------------- */

const HOUR_PX = 48; // one hour of grid height
const SNAP = 15; // drag snap, minutes
const GUTTER = 56; // time-label column width
const GRID_H = 24 * HOUR_PX;
const DAY_MIN = 24 * 60;

const snapRound = (m: number) => Math.round(m / SNAP) * SNAP;
const snapFloor = (m: number) => Math.floor(m / SNAP) * SNAP;

/** Calendar block length for a task: explicit → estimate → an hour. */
const taskDuration = (t: Task) => t.durationMinutes ?? t.estimateMinutes ?? 60;

type CalMode = "day" | "week" | "month" | "custom";

/* ------------------------------ drag machinery ----------------------------- */

type ZoneKind = "grid" | "allday" | "tray" | "mcell" | "out";

interface DragState {
  mode: "move" | "resize-start" | "resize-end" | "create" | "external";
  task: Task | null; // null while creating
  grabOffsetMin: number; // pointer offset from block start (move)
  anchorMin: number; // create: minute pressed
  origStart: number;
  origDur: number;
  moved: boolean;
  startX: number;
  startY: number;
  // live target
  zone: ZoneKind;
  day: number; // index into the visible days
  startMin: number;
  durMin: number;
  /** Month view: date under the pointer while zone === "mcell". */
  dateStr: string | null;
  pointerX: number;
  pointerY: number;
}

interface QuickCreateSpec {
  dateStr: string;
  startMin: number;
  durMin: number;
  allDay: boolean;
  x: number;
  y: number;
}

/** One rendered block in a day column (real task, drag ghost, or pending create). */
interface Placed {
  key: string;
  task: Task | null;
  start: number;
  dur: number;
  ghost?: boolean;
  pending?: boolean;
}

/** Classic column-packing for overlapping events; returns col index + cluster width. */
function layoutOverlaps(items: Placed[]): Map<string, { col: number; cols: number }> {
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

/* --------------------------------- helpers -------------------------------- */

function projectColorOf(task: Task | null, projects: Project[], fallback: string): string {
  if (!task) return fallback;
  if (!task.projectId) return INBOX_COLOR;
  return projects.find((p) => p.id === task.projectId)?.color ?? fallback;
}

/** #RRGGBB + alpha byte — soft pastel fill behind each event. */
function tint(hex: string, dark: boolean): string {
  const a = dark ? "3d" : "26";
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${a}` : hex;
}

/* ------------------------------- mini month -------------------------------- */

function MiniMonth({
  visibleDays,
  onPick,
}: {
  visibleDays: string[];
  onPick: (day: string) => void;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(parseDateStr(visibleDays[0])));
  useEffect(() => {
    setCursor(startOfMonth(parseDateStr(visibleDays[0])));
  }, [visibleDays[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayStr();
  const gridStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthIdx = cursor.getMonth();

  return (
    <div className="px-3">
      <div className="mb-1 flex items-center justify-between pl-1">
        <span className="text-[12.5px] font-semibold text-ink">{format(cursor, "MMMM yyyy")}</span>
        <div className="flex items-center">
          <button
            onClick={() => setCursor(addMonths(cursor, -1))}
            className="rounded-md p-1 text-ink3 hover:bg-ink/5 hover:text-ink transition-colors"
          >
            <IconChevronUp size={13} />
          </button>
          <button
            onClick={() => setCursor(addMonths(cursor, 1))}
            className="rounded-md p-1 text-ink3 hover:bg-ink/5 hover:text-ink transition-colors"
          >
            <IconChevronDown size={13} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <span key={d} className="py-0.5 text-[9.5px] font-medium text-ink3">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const s = toDateStr(d);
          const inView = visibleDays.includes(s);
          const isToday = s === today;
          return (
            <button
              key={s}
              onClick={() => onPick(s)}
              className={cn(
                "mx-auto my-[1px] flex h-[22px] w-[22px] items-center justify-center rounded-md text-[10.5px] tabular-nums transition-colors",
                d.getMonth() !== monthIdx ? "text-ink3/60" : "text-ink2",
                inView && !isToday && "bg-accent/10 text-ink",
                isToday && "bg-red-500 font-semibold text-white",
                !isToday && "hover:bg-ink/5",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Header title that opens a mini-month popover for jumping to any date. */
function MonthPicker({
  label,
  visibleDays,
  onPick,
}: {
  label: string;
  visibleDays: string[];
  onPick: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="group flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 -ml-1.5 transition-colors hover:bg-ink/5"
        title="Jump to date"
      >
        <h1 className="truncate text-[19px] font-semibold tracking-[-0.01em] text-ink">
          {label}
        </h1>
        <IconChevronDown
          size={14}
          className={cn(
            "shrink-0 text-ink3 transition-transform group-hover:text-ink2",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[45]" onMouseDown={() => setOpen(false)} />
          <div className="anim-pop absolute left-0 top-full z-[46] mt-1.5 w-[248px] rounded-xl border border-bord bg-pop py-2.5 shadow-pop">
            <MiniMonth
              visibleDays={visibleDays}
              onPick={(d) => {
                onPick(d);
                setOpen(false);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------- quick create pop ---------------------------- */

function QuickCreatePopover({
  spec,
  project,
  onCreate,
  onClose,
}: {
  spec: QuickCreateSpec;
  project: Project | null;
  onCreate: (title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, []);

  const x = clamp(spec.x, 8, window.innerWidth - 296);
  const y = clamp(spec.y, 8, window.innerHeight - 160);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} />
      <div
        className="anim-pop fixed z-[61] w-[286px] rounded-xl border border-bord bg-pop p-3 shadow-pop"
        style={{ left: x, top: y }}
      >
        <p className="text-[11.5px] text-ink3">
          {format(parseDateStr(spec.dateStr), "EEE, MMM d")} ·{" "}
          {spec.allDay ? "All day" : formatTimeRange(spec.startMin, spec.startMin + spec.durMin)}
        </p>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              onCreate(title);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
          placeholder="Task title"
          className="mt-1 h-[30px] w-full bg-transparent text-[13.5px] font-medium text-ink outline-none placeholder:text-ink3"
        />
        <div className="mt-2 flex items-center justify-between border-t border-bord pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink3">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: project?.color ?? INBOX_COLOR }}
            />
            <span className="truncate">{project?.name ?? "Inbox"}</span>
          </span>
          <Button size="xs" variant="primary" onClick={() => onCreate(title)}>
            Add task
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/* -------------------------------- event block ------------------------------ */

function EventBlock({
  placed,
  lay,
  color,
  dark,
  selected,
  onPointerDownMove,
  onPointerDownResize,
  onContextMenu,
}: {
  placed: Placed;
  lay: { col: number; cols: number };
  color: string;
  dark: boolean;
  selected: boolean;
  onPointerDownMove?: (e: React.PointerEvent) => void;
  onPointerDownResize?: (e: React.PointerEvent, edge: "start" | "end") => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { task, start, dur, ghost, pending } = placed;
  const top = (start / 60) * HOUR_PX;
  const height = Math.max(17, (dur / 60) * HOUR_PX - 2);
  const width = 100 / lay.cols;
  const done = task?.status === "done";
  const compact = height < 34;

  const style: CSSProperties = {
    top,
    height,
    left: `${lay.col * width}%`,
    width: `calc(${width}% - ${lay.cols > 1 ? 2 : 5}px)`,
    background: pending ? undefined : tint(color, dark),
    borderLeftColor: pending ? undefined : color,
  };

  return (
    <div
      data-cal-block
      onPointerDown={onPointerDownMove}
      onContextMenu={onContextMenu}
      style={style}
      className={cn(
        "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-[3px] select-none",
        pending
          ? "z-30 border border-dashed border-accent border-l-[3px] border-l-accent bg-accent/10"
          : "cursor-grab",
        ghost && "z-40 shadow-pop opacity-95",
        !ghost && !pending && "z-10 hover:shadow-cardHover",
        done && "opacity-50",
        selected && "ring-2 ring-accent",
      )}
    >
      {compact ? (
        <div className="flex h-full items-center gap-1 overflow-hidden">
          <p className={cn("truncate text-[11.5px] font-medium leading-none text-ink", done && "line-through")}>
            {task ? task.title : "New task"}
          </p>
          <span className="ml-auto shrink-0 text-[10px] leading-none text-ink3">
            {formatClock(start)}
          </span>
        </div>
      ) : (
        <>
          <p
            className={cn(
              "break-words text-[11.5px] font-medium leading-[1.25] text-ink",
              done && "line-through",
            )}
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              // keep the time range visible: title only takes the lines that fit
              WebkitLineClamp: Math.max(1, Math.floor((height - 20) / 14.5)),
              overflow: "hidden",
            }}
          >
            {task ? task.title : "New task"}
          </p>
          <p className="mt-px truncate text-[10.5px] leading-tight text-ink3">
            {formatTimeRange(start, start + dur)}
          </p>
        </>
      )}
      {!pending && !ghost && onPointerDownResize && (
        <>
          <div
            className="absolute inset-x-0 top-0 h-[5px] cursor-ns-resize"
            onPointerDown={(e) => onPointerDownResize(e, "start")}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[5px] cursor-ns-resize"
            onPointerDown={(e) => onPointerDownResize(e, "end")}
          />
        </>
      )}
    </div>
  );
}

/* --------------------------------- the view -------------------------------- */

export function CalendarView() {
  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const settings = useSettings((s) => s.settings);
  const setViewPref = useSettings((s) => s.setViewPref);
  const openDetail = useUI((s) => s.openDetail);
  const detailTaskId = useUI((s) => s.detailTaskId);
  const toast = useUI((s) => s.toast);
  const dark = isDark(settings);

  const projs = activeProjects(projects);

  /* ------------------------------ view mode ------------------------------- */

  const modeRaw = settings.viewPrefs["cal.mode"];
  const mode: CalMode =
    modeRaw === "day" || modeRaw === "month" || modeRaw === "custom" ? modeRaw : "week";
  const customDays = clamp(Math.round(Number(settings.viewPrefs["cal.days"]) || 3), 2, 30);

  /* ------------------------------ days + clock ------------------------------ */

  const [anchor, setAnchor] = useState(() => todayStr());
  const days = useMemo(() => {
    switch (mode) {
      case "day":
      case "month":
        return [anchor];
      case "custom": {
        const start = parseDateStr(anchor);
        return Array.from({ length: customDays }, (_, i) => toDateStr(addDays(start, i)));
      }
      default: {
        const start = startOfWeek(parseDateStr(anchor), { weekStartsOn: 1 });
        return Array.from({ length: 7 }, (_, i) => toDateStr(addDays(start, i)));
      }
    }
  }, [anchor, mode, customDays]);
  const nDays = days.length;

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const now = new Date();
  const today = toDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIdx = days.indexOf(today);

  /* ------------------------- active project + tray -------------------------- */

  // Picked from the arrow rail beside the main sidebar's project list.
  const activeKey = calendarActiveKey(settings.viewPrefs, projs);
  const activeProject = projs.find((p) => p.id === activeKey) ?? null;
  const trayOpen = settings.viewPrefs["cal.tray"] === "1";

  const trayTasks = useMemo(
    () => unscheduledTasks(tasks, activeKey === CAL_INBOX_KEY ? null : activeKey),
    [tasks, activeKey],
  );

  /* ------------------------------ tasks by day ------------------------------ */

  const byDay = useMemo(() => {
    const map = days.map(() => ({ timed: [] as Task[], allDay: [] as Task[] }));
    for (const t of visibleTasks(tasks, projects)) {
      if (!t.doDate) continue;
      const idx = days.indexOf(t.doDate);
      if (idx === -1) continue;
      if (t.doTime != null) map[idx].timed.push(t);
      else map[idx].allDay.push(t);
    }
    for (const m of map) m.allDay.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [tasks, projects, days]);

  /* ------------------------------- month grid ------------------------------- */

  const monthCells = useMemo(() => {
    if (mode !== "month") return [];
    const gridStart = startOfWeek(startOfMonth(parseDateStr(anchor)), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => toDateStr(addDays(gridStart, i)));
  }, [mode, anchor]);

  const monthTasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    if (mode !== "month") return map;
    const cellSet = new Set(monthCells);
    for (const t of visibleTasks(tasks, projects)) {
      if (!t.doDate || !cellSet.has(t.doDate)) continue;
      const arr = map.get(t.doDate) ?? [];
      arr.push(t);
      map.set(t.doDate, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const at = a.doTime != null ? parseHM(a.doTime) ?? 0 : -1;
        const bt = b.doTime != null ? parseHM(b.doTime) ?? 0 : -1;
        return at - bt || a.sortOrder - b.sortOrder;
      });
    }
    return map;
  }, [mode, monthCells, tasks, projects]);

  /* --------------------------------- dragging -------------------------------- */

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const allDayRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDrag = (d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  const [qc, setQc] = useState<QuickCreateSpec | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; task: Task } | null>(null);

  /** Raw minute-of-day for a clientY against the grid content (unsnapped, unclamped). */
  const yToMin = (clientY: number): number => {
    const r = contentRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return ((clientY - r.top) / HOUR_PX) * 60;
  };

  const dayFromX = (clientX: number): number => {
    const r = contentRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return clamp(
      Math.floor((clientX - r.left - GUTTER) / ((r.width - GUTTER) / nDays)),
      0,
      nDays - 1,
    );
  };

  const zoneAt = (
    x: number,
    y: number,
  ): { kind: ZoneKind; day: number; min: number; dateStr?: string } => {
    const tray = trayRef.current?.getBoundingClientRect();
    if (tray && x >= tray.left && x <= tray.right && y >= tray.top && y <= tray.bottom) {
      return { kind: "tray", day: 0, min: 0 };
    }
    if (mode === "month") {
      const el = document.elementFromPoint(x, y)?.closest("[data-mdate]");
      const ds = el?.getAttribute("data-mdate");
      if (ds) return { kind: "mcell", day: 0, min: 0, dateStr: ds };
      return { kind: "out", day: 0, min: 0 };
    }
    const ad = allDayRef.current?.getBoundingClientRect();
    const grid = contentRef.current?.getBoundingClientRect();
    const sc = scrollRef.current?.getBoundingClientRect();
    if (ad && x >= ad.left + GUTTER - 8 && x <= ad.right && y >= ad.top - 4 && y <= ad.bottom) {
      return { kind: "allday", day: dayFromX(x), min: 0 };
    }
    if (grid && sc && x >= grid.left + GUTTER - 8 && x <= grid.right && y >= sc.top && y <= sc.bottom) {
      return { kind: "grid", day: dayFromX(x), min: clamp(yToMin(y), 0, DAY_MIN - 1) };
    }
    return { kind: "out", day: 0, min: 0 };
  };

  const startDrag = (
    e: React.PointerEvent,
    init: Pick<
      DragState,
      "mode" | "task" | "grabOffsetMin" | "anchorMin" | "origStart" | "origDur" | "zone" | "day" | "startMin" | "durMin"
    >,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setQc(null);
    setDrag({
      ...init,
      dateStr: null,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      pointerX: e.clientX,
      pointerY: e.clientY,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const cls =
      drag.mode === "resize-start" || drag.mode === "resize-end"
        ? "cal-resizing"
        : drag.mode === "create"
          ? "cal-creating"
          : "cal-grabbing";
    document.body.classList.add(cls);

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved =
        d.moved || Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 5;
      let next: DragState = { ...d, moved, pointerX: e.clientX, pointerY: e.clientY };
      const z = zoneAt(e.clientX, e.clientY);

      if (d.mode === "create") {
        // Locked to the day/zone where the press started.
        if (d.zone === "grid" && z.kind === "grid") {
          const cur = snapRound(clamp(z.min, 0, DAY_MIN));
          const start = Math.min(snapFloor(d.anchorMin), cur);
          const end = Math.max(Math.max(snapFloor(d.anchorMin), cur), start + SNAP);
          next = { ...next, startMin: start, durMin: end - start };
        }
      } else if (d.mode === "resize-end") {
        const end = clamp(snapRound(z.kind === "grid" ? z.min : yToMin(e.clientY)), d.origStart + SNAP, DAY_MIN);
        next = { ...next, durMin: end - d.origStart, startMin: d.origStart };
      } else if (d.mode === "resize-start") {
        const origEnd = d.origStart + d.origDur;
        const start = clamp(snapRound(z.kind === "grid" ? z.min : yToMin(e.clientY)), 0, origEnd - SNAP);
        next = { ...next, startMin: start, durMin: origEnd - start };
      } else {
        // move / external follow the pointer across zones
        if (z.kind === "grid") {
          const start = clamp(snapRound(z.min - d.grabOffsetMin), 0, DAY_MIN - d.durMin);
          next = { ...next, zone: "grid", day: z.day, startMin: start, dateStr: null };
        } else if (z.kind === "allday") {
          next = { ...next, zone: "allday", day: z.day, dateStr: null };
        } else if (z.kind === "mcell") {
          next = { ...next, zone: "mcell", dateStr: z.dateStr ?? null };
        } else if (z.kind === "tray" && d.mode === "move") {
          next = { ...next, zone: "tray", dateStr: null };
        } else if (z.kind === "tray" && d.mode === "external") {
          next = { ...next, zone: "out", dateStr: null };
        } else {
          next = { ...next, zone: "out", dateStr: null };
        }
      }

      // Edge auto-scroll — only while the pointer is actually over the grid,
      // so passing near the edge from the tray/sidebar doesn't shift the view.
      const sc = scrollRef.current;
      if (sc && z.kind === "grid") {
        const r = sc.getBoundingClientRect();
        if (e.clientY < r.top + 44) sc.scrollTop -= 14;
        else if (e.clientY > r.bottom - 44) sc.scrollTop += 14;
      }

      setDrag(next);
    };

    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const data = useData.getState();

      if (!d.moved) {
        if ((d.mode === "move" || d.mode === "external") && d.task) {
          openDetail(d.task.id); // plain click
        } else if (d.mode === "create") {
          const start = clamp(snapFloor(d.anchorMin), 0, DAY_MIN - 60);
          setQc({
            dateStr: days[d.day],
            startMin: d.zone === "allday" ? 0 : start,
            durMin: 60,
            allDay: d.zone === "allday",
            x: d.pointerX + 10,
            y: d.pointerY + 6,
          });
        }
        return;
      }

      switch (d.mode) {
        case "create":
          if (d.zone === "grid") {
            setQc({
              dateStr: days[d.day],
              startMin: d.startMin,
              durMin: d.durMin,
              allDay: false,
              x: d.pointerX + 10,
              y: d.pointerY + 6,
            });
          }
          break;
        case "move": {
          if (!d.task) break;
          if (d.zone === "tray") {
            data.updateTask(d.task.id, { doDate: null, doTime: null });
            toast("Unscheduled — moved to the tray", "info");
          } else if (d.zone === "allday") {
            data.updateTask(d.task.id, { doDate: days[d.day], doTime: null });
          } else if (d.zone === "mcell" && d.dateStr) {
            data.updateTask(d.task.id, { doDate: d.dateStr });
          } else if (d.zone === "grid") {
            data.updateTask(d.task.id, {
              doDate: days[d.day],
              doTime: minutesToHM(d.startMin),
              durationMinutes: d.durMin,
            });
          }
          break;
        }
        case "external": {
          if (!d.task) break;
          if (d.zone === "allday") {
            data.updateTask(d.task.id, { doDate: days[d.day], doTime: null });
          } else if (d.zone === "mcell" && d.dateStr) {
            data.updateTask(d.task.id, { doDate: d.dateStr });
          } else if (d.zone === "grid") {
            data.updateTask(d.task.id, {
              doDate: days[d.day],
              doTime: minutesToHM(d.startMin),
              durationMinutes: d.durMin,
            });
          }
          break;
        }
        case "resize-start":
        case "resize-end":
          if (d.task) {
            data.updateTask(d.task.id, {
              doTime: minutesToHM(d.startMin),
              durationMinutes: d.durMin,
            });
          }
          break;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setDrag(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.body.classList.remove("cal-grabbing", "cal-resizing", "cal-creating");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag != null]);

  /* ------------------------------ initial scroll ----------------------------- */

  useLayoutEffect(() => {
    if (mode === "month") return;
    const sc = scrollRef.current;
    if (!sc) return;
    const target =
      todayIdx >= 0
        ? ((nowMin - 100) / 60) * HOUR_PX
        : 7.5 * HOUR_PX;
    sc.scrollTop = clamp(target, 0, GRID_H - sc.clientHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /* ------------------------------- create task ------------------------------- */

  const createFromQc = (title: string) => {
    if (!qc) return;
    const data = useData.getState();
    const t = data.addTask({
      title: title.trim() || "New task",
      projectId: activeProject?.id ?? null,
      priority: settings.defaultPriority,
      doDate: qc.dateStr,
      ...(qc.allDay
        ? {}
        : { doTime: minutesToHM(qc.startMin), durationMinutes: qc.durMin }),
    });
    setQc(null);
    void t;
  };

  /* ------------------------------ per-day blocks ----------------------------- */

  const placedByDay: Placed[][] = days.map((d, idx) => {
    const list: Placed[] = [];
    for (const t of byDay[idx].timed) {
      if (
        drag?.moved &&
        drag.task?.id === t.id &&
        (drag.mode === "move" || drag.mode === "resize-start" || drag.mode === "resize-end")
      ) {
        continue; // original hidden while its ghost rides the pointer
      }
      list.push({ key: t.id, task: t, start: parseHM(t.doTime!) ?? 0, dur: taskDuration(t) });
    }
    if (drag?.moved && drag.zone === "grid" && drag.day === idx) {
      if (drag.mode === "create") {
        list.push({ key: "__create", task: null, start: drag.startMin, dur: drag.durMin, pending: true });
      } else if (drag.task) {
        list.push({ key: "__ghost", task: drag.task, start: drag.startMin, dur: drag.durMin, ghost: true });
      }
    }
    if (qc && !qc.allDay && qc.dateStr === d) {
      list.push({ key: "__qc", task: null, start: qc.startMin, dur: qc.durMin, pending: true });
    }
    return list;
  });

  /* --------------------------------- render ---------------------------------- */

  const midDay = days[Math.floor((nDays - 1) / 2)];
  const titleLabel =
    mode === "month"
      ? format(parseDateStr(anchor), "MMMM yyyy")
      : format(parseDateStr(midDay), "MMMM yyyy");
  const rangeLabel =
    mode === "month"
      ? `${format(startOfMonth(parseDateStr(anchor)), "MMM d")} – ${format(endOfMonth(parseDateStr(anchor)), "MMM d")}`
      : mode === "day"
        ? format(parseDateStr(days[0]), "EEEE, MMM d")
        : `${format(parseDateStr(days[0]), "MMM d")} – ${format(parseDateStr(days[nDays - 1]), "MMM d")}`;

  const step = (dir: 1 | -1) => {
    const cur = parseDateStr(anchor);
    if (mode === "month") setAnchor(toDateStr(addMonths(cur, dir)));
    else if (mode === "day") setAnchor(toDateStr(addDays(cur, dir)));
    else if (mode === "custom") setAnchor(toDateStr(addDays(cur, dir * customDays)));
    else setAnchor(toDateStr(addDays(cur, dir * 7)));
  };
  const stepTitle = mode === "month" ? "month" : mode === "day" ? "day" : mode === "custom" ? `${customDays} days` : "week";

  const floatingDrag =
    drag?.moved &&
    drag.task &&
    (drag.zone === "tray" || drag.zone === "out" || drag.zone === "allday" || drag.zone === "mcell");

  const monthAnchorIdx = parseDateStr(anchor).getMonth();
  const MAX_CHIPS = 3;

  return (
    <div className="relative flex h-full min-w-0 flex-1">
      {/* ------------------------- unscheduled tray ------------------------- */}
      {trayOpen && (
        <aside
          ref={trayRef}
          className={cn(
            "anim-slide-right flex w-[236px] shrink-0 flex-col border-r border-bord bg-panel/40 transition-shadow",
            drag?.moved && drag.zone === "tray" && "ring-2 ring-inset ring-accent/60 bg-accent/[0.05]",
          )}
        >
          <div data-tauri-drag-region className="h-[38px] shrink-0" />
          <div className="flex items-center gap-2 px-3.5 pb-1">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: activeProject?.color ?? INBOX_COLOR }}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
              {activeProject?.name ?? "Inbox"}
            </span>
            <button
              onClick={() => setViewPref("cal.tray", "0")}
              className="rounded-md p-1 text-ink3 transition-colors hover:bg-ink/5 hover:text-ink"
              title="Close"
            >
              <IconX size={13} />
            </button>
          </div>
          <p className="px-3.5 pb-2 text-[11px] text-ink3">
            No date yet — drag onto the calendar. Drop events here to unschedule.
          </p>
          <div className="flex-1 overflow-y-auto px-2.5 pb-3">
            {trayTasks.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-bord2/80 px-3 py-4 text-center text-[11.5px] leading-relaxed text-ink3">
                Everything here is scheduled.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {trayTasks.map((t) => (
                  <div
                    key={t.id}
                    onPointerDown={(e) =>
                      startDrag(e, {
                        mode: "external",
                        task: t,
                        grabOffsetMin: 0,
                        anchorMin: 0,
                        origStart: 0,
                        origDur: taskDuration(t),
                        zone: "out",
                        day: 0,
                        startMin: 9 * 60,
                        durMin: taskDuration(t),
                      })
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, task: t });
                    }}
                    className={cn(
                      "cursor-grab rounded-lg border border-bord bg-card px-2.5 py-2 shadow-card transition-all hover:border-bord2 hover:shadow-cardHover",
                      drag?.moved && drag.task?.id === t.id && "opacity-30",
                    )}
                  >
                    <p className="break-words text-[12.5px] leading-snug text-ink">{t.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
                      {t.priority && (
                        <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_META[t.priority].dot)} />
                      )}
                      {t.estimateMinutes != null && t.estimateMinutes > 0 && (
                        <span className="text-[10.5px] text-ink3">{formatMinutes(t.estimateMinutes)}</span>
                      )}
                      {t.dueDate && (
                        <span
                          className={cn(
                            "text-[10.5px]",
                            t.dueDate < today ? "font-medium text-red-500" : "text-ink3",
                          )}
                        >
                          due {relativeDayLabel(t.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ----------------------------- main pane ----------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col bg-card">
        <header
          data-tauri-drag-region
          className="flex shrink-0 items-end justify-between gap-4 px-6 pb-3 pt-9"
        >
          <div className="min-w-0">
            <MonthPicker label={titleLabel} visibleDays={days} onPick={setAnchor} />
            <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink3">
              <span>{rangeLabel}</span>
              <span className="text-ink3/50">·</span>
              <span className="flex min-w-0 items-center gap-1" title="New events join this project — pick with the arrows next to the sidebar">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: activeProject?.color ?? INBOX_COLOR }}
                />
                <span className="truncate">{activeProject?.name ?? "Inbox"}</span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Segmented
              value={mode}
              onChange={(v) => setViewPref("cal.mode", v)}
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
                { value: "custom", label: `${customDays}d`, title: "Custom number of days" },
              ]}
            />
            {mode === "custom" && (
              <input
                type="number"
                min={2}
                max={30}
                value={customDays}
                onChange={(e) => {
                  const n = clamp(Math.round(Number(e.target.value) || 0), 2, 30);
                  setViewPref("cal.days", String(n));
                }}
                title="How many days to show"
                className="h-[26px] w-[52px] rounded-lg border border-bord bg-card px-1 text-center text-[12px] tabular-nums text-ink focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            )}
            <Button variant="secondary" onClick={() => setAnchor(todayStr())}>
              Today
            </Button>
            <button
              onClick={() => step(-1)}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-ink2 transition-colors hover:bg-ink/5 hover:text-ink"
              title={`Previous ${stepTitle}`}
            >
              <IconChevronLeft size={15} />
            </button>
            <button
              onClick={() => step(1)}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-ink2 transition-colors hover:bg-ink/5 hover:text-ink"
              title={`Next ${stepTitle}`}
            >
              <IconChevronRight size={15} />
            </button>
          </div>
        </header>

        {mode === "month" ? (
          <>
            {/* ------------------------------ month view ------------------------------ */}
            <div className="flex shrink-0 border-b border-bord">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "flex-1 py-1.5 text-center text-[11px] font-medium text-ink3",
                    i > 0 && "border-l border-bord/70",
                  )}
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
              {monthCells.map((dateStr, i) => {
                const date = parseDateStr(dateStr);
                const inMonth = date.getMonth() === monthAnchorIdx;
                const isToday = dateStr === today;
                const cellTasks = monthTasksByDay.get(dateStr) ?? [];
                const shown = cellTasks.slice(0, MAX_CHIPS);
                const overflow = cellTasks.length - shown.length;
                const dropTarget = drag?.moved && drag.zone === "mcell" && drag.dateStr === dateStr;
                return (
                  <div
                    key={dateStr}
                    data-mdate={dateStr}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return;
                      setQc({
                        dateStr,
                        startMin: 0,
                        durMin: 60,
                        allDay: true,
                        x: e.clientX + 8,
                        y: e.clientY + 6,
                      });
                    }}
                    className={cn(
                      "flex min-h-0 flex-col gap-[2px] overflow-hidden border-b border-bord/70 px-[3px] pb-1 pt-[3px]",
                      i % 7 > 0 && "border-l border-bord/70",
                      !inMonth && "bg-panel/30",
                      dropTarget && "bg-accent/10 ring-2 ring-inset ring-accent/50",
                    )}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAnchor(dateStr);
                        setViewPref("cal.mode", "day");
                      }}
                      title="Open day view"
                      className={cn(
                        "mx-auto flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-medium tabular-nums transition-colors",
                        isToday
                          ? "bg-red-500 font-semibold text-white"
                          : inMonth
                            ? "text-ink2 hover:bg-ink/5"
                            : "text-ink3/70 hover:bg-ink/5",
                      )}
                    >
                      {date.getDate()}
                    </button>
                    {shown.map((t) => {
                      const color = projectColorOf(t, projects, settings.accentColor);
                      const done = t.status === "done";
                      const hidden = drag?.moved && drag.task?.id === t.id;
                      if (hidden) return null;
                      const startMin = t.doTime != null ? parseHM(t.doTime) : null;
                      return (
                        <div
                          key={t.id}
                          onPointerDown={(e) =>
                            startDrag(e, {
                              mode: "move",
                              task: t,
                              grabOffsetMin: 0,
                              anchorMin: 0,
                              origStart: startMin ?? 9 * 60,
                              origDur: taskDuration(t),
                              zone: "out",
                              day: 0,
                              startMin: startMin ?? 9 * 60,
                              durMin: taskDuration(t),
                            })
                          }
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenu({ x: e.clientX, y: e.clientY, task: t });
                          }}
                          style={{ background: tint(color, dark), borderLeftColor: color }}
                          className={cn(
                            "shrink-0 cursor-grab select-none truncate rounded-[4px] border-l-2 px-1 py-[1.5px] text-[10.5px] font-medium leading-[1.35] text-ink",
                            done && "opacity-50 line-through",
                            detailTaskId === t.id && "ring-2 ring-accent",
                          )}
                          title={t.title}
                        >
                          {startMin != null && (
                            <span className="mr-1 text-[9.5px] font-normal tabular-nums text-ink3">
                              {formatClock(startMin).replace(" ", "")}
                            </span>
                          )}
                          {t.title}
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnchor(dateStr);
                          setViewPref("cal.mode", "day");
                        }}
                        className="shrink-0 self-start rounded px-1 text-[10px] font-medium text-ink3 transition-colors hover:bg-ink/5 hover:text-ink2"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* day headers */}
            <div className="flex shrink-0 border-b border-bord" style={{ paddingLeft: GUTTER }}>
              {days.map((d, i) => {
                const date = parseDateStr(d);
                const isToday = d === today;
                return (
                  <div
                    key={d}
                    className="flex flex-1 items-center justify-center gap-1.5 border-l border-bord/70 py-1.5 first:border-l-transparent"
                  >
                    <span className={cn("text-[11.5px] font-medium", isToday ? "text-ink" : "text-ink3")}>
                      {format(date, "EEE")}
                    </span>
                    <span
                      className={cn(
                        "flex h-[20px] min-w-[20px] items-center justify-center rounded-md px-1 text-[11.5px] font-semibold tabular-nums",
                        isToday ? "bg-red-500 text-white" : "text-ink2",
                      )}
                    >
                      {format(date, "d")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* all-day row */}
            <div ref={allDayRef} className="flex min-h-[30px] shrink-0 border-b border-bord">
              <div className="flex shrink-0 items-start justify-end pr-2 pt-1" style={{ width: GUTTER }}>
                <span className="text-[9px] font-medium uppercase tracking-wide text-ink3">all-day</span>
              </div>
              {days.map((d, idx) => {
                const dropTarget = drag?.moved && drag.zone === "allday" && drag.day === idx;
                return (
                  <div
                    key={d}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return;
                      setQc({
                        dateStr: d,
                        startMin: 0,
                        durMin: 60,
                        allDay: true,
                        x: e.clientX + 8,
                        y: e.clientY + 6,
                      });
                    }}
                    className={cn(
                      "flex max-h-[92px] flex-1 flex-col gap-[3px] overflow-y-auto border-l border-bord/70 px-[3px] py-[3px] first:border-l-transparent",
                      dropTarget && "bg-accent/10",
                    )}
                  >
                    {byDay[idx].allDay.map((t) => {
                      const color = projectColorOf(t, projects, settings.accentColor);
                      const done = t.status === "done";
                      const hidden = drag?.moved && drag.task?.id === t.id && drag.mode === "move";
                      if (hidden) return null;
                      return (
                        <div
                          key={t.id}
                          onPointerDown={(e) =>
                            startDrag(e, {
                              mode: "move",
                              task: t,
                              grabOffsetMin: 0,
                              anchorMin: 0,
                              origStart: 9 * 60,
                              origDur: taskDuration(t),
                              zone: "allday",
                              day: idx,
                              startMin: 9 * 60,
                              durMin: taskDuration(t),
                            })
                          }
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenu({ x: e.clientX, y: e.clientY, task: t });
                          }}
                          style={{ background: tint(color, dark), borderLeftColor: color }}
                          className={cn(
                            "shrink-0 cursor-grab select-none truncate rounded-[5px] border-l-[3px] px-1.5 py-[2px] text-[11px] font-medium leading-[1.35] text-ink",
                            done && "opacity-50 line-through",
                            detailTaskId === t.id && "ring-2 ring-accent",
                          )}
                          title={t.title}
                        >
                          {t.title}
                        </div>
                      );
                    })}
                    {qc && qc.allDay && qc.dateStr === d && (
                      <div className="shrink-0 truncate rounded-[5px] border border-dashed border-accent bg-accent/10 px-1.5 py-[2px] text-[11px] font-medium text-ink">
                        New task
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* time grid */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div
                ref={contentRef}
                className="relative"
                style={{ height: GRID_H }}
                onPointerDown={(e) => {
                  const z = zoneAt(e.clientX, e.clientY);
                  if (z.kind !== "grid") return;
                  startDrag(e, {
                    mode: "create",
                    task: null,
                    grabOffsetMin: 0,
                    anchorMin: z.min,
                    origStart: snapFloor(z.min),
                    origDur: 60,
                    zone: "grid",
                    day: z.day,
                    startMin: snapFloor(z.min),
                    durMin: SNAP,
                  });
                }}
              >
                {/* hour lines + labels */}
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h}>
                    {h > 0 && (
                      <>
                        <div
                          className="pointer-events-none absolute right-0 border-t border-bord/60"
                          style={{ top: h * HOUR_PX, left: GUTTER }}
                        />
                        <span
                          className="pointer-events-none absolute select-none text-right text-[10px] tabular-nums text-ink3"
                          style={{ top: h * HOUR_PX - 7, left: 0, width: GUTTER - 10 }}
                        >
                          {formatClock(h * 60)}
                        </span>
                      </>
                    )}
                  </div>
                ))}

                {/* day columns */}
                {days.map((d, idx) => {
                  const placed = placedByDay[idx];
                  const lay = layoutOverlaps(placed);
                  return (
                    <div
                      key={d}
                      className="absolute inset-y-0 border-l border-bord/70"
                      style={{
                        left: `calc(${GUTTER}px + ${idx} * (100% - ${GUTTER}px) / ${nDays})`,
                        width: `calc((100% - ${GUTTER}px) / ${nDays})`,
                      }}
                    >
                      {placed.map((p) => (
                        <EventBlock
                          key={p.key}
                          placed={p}
                          lay={lay.get(p.key) ?? { col: 0, cols: 1 }}
                          color={projectColorOf(p.task, projects, settings.accentColor)}
                          dark={dark}
                          selected={p.task != null && detailTaskId === p.task.id}
                          onPointerDownMove={
                            p.task && !p.ghost
                              ? (e) => {
                                  const t = p.task!;
                                  startDrag(e, {
                                    mode: "move",
                                    task: t,
                                    grabOffsetMin: yToMin(e.clientY) - p.start,
                                    anchorMin: yToMin(e.clientY),
                                    origStart: p.start,
                                    origDur: p.dur,
                                    zone: "grid",
                                    day: idx,
                                    startMin: p.start,
                                    durMin: p.dur,
                                  });
                                }
                              : undefined
                          }
                          onPointerDownResize={
                            p.task && !p.ghost
                              ? (e, edge) => {
                                  const t = p.task!;
                                  startDrag(e, {
                                    mode: edge === "start" ? "resize-start" : "resize-end",
                                    task: t,
                                    grabOffsetMin: 0,
                                    anchorMin: yToMin(e.clientY),
                                    origStart: p.start,
                                    origDur: p.dur,
                                    zone: "grid",
                                    day: idx,
                                    startMin: p.start,
                                    durMin: p.dur,
                                  });
                                }
                              : undefined
                          }
                          onContextMenu={
                            p.task
                              ? (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setMenu({ x: e.clientX, y: e.clientY, task: p.task! });
                                }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  );
                })}

                {/* now line */}
                {todayIdx >= 0 && (
                  <>
                    <span
                      className="pointer-events-none absolute z-20 whitespace-nowrap rounded bg-card pr-1 text-right text-[9px] font-semibold tabular-nums text-red-500"
                      style={{ top: (nowMin / 60) * HOUR_PX - 6, left: 0, width: GUTTER - 6 }}
                    >
                      {formatClock(nowMin).replace(" ", "")}
                    </span>
                    <div
                      className="pointer-events-none absolute z-20"
                      style={{
                        top: (nowMin / 60) * HOUR_PX,
                        left: `calc(${GUTTER}px + ${todayIdx} * (100% - ${GUTTER}px) / ${nDays})`,
                        width: `calc((100% - ${GUTTER}px) / ${nDays})`,
                      }}
                    >
                      <div className="relative h-[2px] bg-red-500">
                        <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-full bg-red-500" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* floating pill while dragging outside the grid */}
      {floatingDrag &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] flex h-[28px] max-w-[220px] items-center gap-1.5 rounded-lg border border-bord bg-pop px-2.5 shadow-pop"
            style={{ left: drag!.pointerX + 12, top: drag!.pointerY + 8 }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: projectColorOf(drag!.task, projects, settings.accentColor) }}
            />
            <span className="truncate text-[12px] font-medium text-ink">{drag!.task!.title}</span>
            <span className="shrink-0 text-[10.5px] text-ink3">
              {drag!.zone === "allday"
                ? format(parseDateStr(days[drag!.day]), "EEE d")
                : drag!.zone === "mcell" && drag!.dateStr
                  ? format(parseDateStr(drag!.dateStr), "EEE d")
                  : drag!.zone === "tray"
                    ? "unschedule"
                    : ""}
            </span>
          </div>,
          document.body,
        )}

      {/* quick create */}
      {qc && (
        <QuickCreatePopover
          spec={qc}
          project={activeProject}
          onCreate={createFromQc}
          onClose={() => setQc(null)}
        />
      )}

      {/* context menu */}
      {menu && (
        <FloatingMenu
          x={menu.x}
          y={menu.y}
          items={taskMenuItems(menu.task)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* empty-calendar hint */}
      {tasks.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-center">
            <IconCalendar size={26} className="text-ink3/60" />
            <p className="text-[13px] text-ink3">
              Click or drag anywhere on the grid to plan your first task.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
