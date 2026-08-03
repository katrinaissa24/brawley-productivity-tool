import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { Task } from "../types";
import { useData } from "../stores/data";
import { isDark, useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { blockDuration, visibleTasks } from "../stores/selectors";
import {
  layoutOverlaps,
  projectColorOf,
  SNAP,
  snapFloor,
  snapRound,
  tint,
  type TimeSpan,
} from "../lib/timegrid";
import {
  clamp,
  cn,
  formatClock,
  formatMinutes,
  formatTimeRange,
  localDateOf,
  minutesToHM,
  parseHM,
  PRIORITY_META,
  relativeDayLabel,
  todayStr,
} from "../lib/util";
import { taskMenuItems } from "../components/TaskCard";
import { Button, FloatingMenu } from "../components/ui/primitives";
import { IconCheck, IconClock } from "../components/icons";

/* -------------------------------- geometry -------------------------------- */

const HOUR_PX = 52; // one hour of grid height
const GUTTER = 58; // time-label column width
const GRID_H = 24 * HOUR_PX;
const DAY_MIN = 24 * 60;

type Zone = "grid" | "tray" | "out";

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
  zone: Zone;
  startMin: number;
  durMin: number;
  pointerX: number;
  pointerY: number;
}

/** One rendered block (real task, drag ghost, or a pending create). */
interface Placed extends TimeSpan {
  task: Task | null;
  ghost?: boolean;
  pending?: boolean;
}

interface QuickCreateSpec {
  startMin: number;
  durMin: number;
  x: number;
  y: number;
}

/* ------------------------------- quick create ------------------------------ */

function QuickCreatePopover({
  spec,
  onCreate,
  onClose,
}: {
  spec: QuickCreateSpec;
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
  const y = clamp(spec.y, 8, window.innerHeight - 150);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} />
      <div
        className="anim-pop fixed z-[61] w-[286px] rounded-xl border border-bord bg-pop p-3 shadow-pop"
        style={{ left: x, top: y }}
      >
        <p className="text-[11.5px] text-ink3">
          Today · {formatTimeRange(spec.startMin, spec.startMin + spec.durMin)}
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
        <div className="mt-1 flex justify-end border-t border-bord pt-2.5">
          <Button size="xs" variant="primary" onClick={() => onCreate(title)}>
            Add to today
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
  onToggleDone,
}: {
  placed: Placed;
  lay: { col: number; cols: number };
  color: string;
  dark: boolean;
  selected: boolean;
  onPointerDownMove?: (e: React.PointerEvent) => void;
  onPointerDownResize?: (e: React.PointerEvent, edge: "start" | "end") => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onToggleDone?: () => void;
}) {
  const { task, start, dur, ghost, pending } = placed;
  const top = (start / 60) * HOUR_PX;
  const height = Math.max(18, (dur / 60) * HOUR_PX - 2);
  const width = 100 / lay.cols;
  const done = task?.status === "done";
  const compact = height < 36;

  const style: CSSProperties = {
    top,
    height,
    left: `${lay.col * width}%`,
    width: `calc(${width}% - ${lay.cols > 1 ? 3 : 8}px)`,
    background: pending ? undefined : tint(color, dark),
    borderLeftColor: pending ? undefined : color,
  };

  return (
    <div
      onPointerDown={onPointerDownMove}
      onContextMenu={onContextMenu}
      style={style}
      className={cn(
        "absolute select-none overflow-hidden rounded-md border-l-[3px] px-2 py-[3px]",
        pending
          ? "z-30 border border-dashed border-accent border-l-[3px] border-l-accent bg-accent/10"
          : "cursor-grab",
        ghost && "z-40 opacity-95 shadow-pop",
        !ghost && !pending && "z-10 hover:shadow-cardHover",
        done && "opacity-55",
        selected && "ring-2 ring-accent",
      )}
    >
      <div className="flex items-start gap-1.5">
        {task && !ghost && !pending && onToggleDone && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            title={done ? "Reopen" : "Complete"}
            className={cn(
              "mt-[2px] flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
              done ? "border-accent bg-accent text-white" : "border-ink3/60 hover:border-accent",
            )}
          >
            {done && <IconCheck size={8} strokeWidth={3} />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "break-words text-[11.5px] font-medium leading-[1.25] text-ink",
              done && "line-through",
            )}
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: compact ? 1 : Math.max(1, Math.floor((height - 20) / 14.5)),
              overflow: "hidden",
            }}
          >
            {task ? task.title : "New task"}
            {/* A thin block has no second line — the time rides along with the title. */}
            {compact && (
              <span className="ml-1.5 text-[10.5px] font-normal text-ink3">
                {formatTimeRange(start, start + dur)}
              </span>
            )}
          </p>
          {!compact && (
            <p className="mt-px truncate text-[10.5px] leading-tight text-ink3">
              {formatTimeRange(start, start + dur)}
            </p>
          )}
        </div>
      </div>
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

/* ---------------------------------- view ----------------------------------- */

/**
 * Today as a single-day calendar: everything with a time sits in the grid,
 * everything without waits in the strip on top until it's dragged onto one.
 */
export function TodayCalendar() {
  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const settings = useSettings((s) => s.settings);
  const openDetail = useUI((s) => s.openDetail);
  const detailTaskId = useUI((s) => s.detailTaskId);
  const toast = useUI((s) => s.toast);
  const dark = isDark(settings);

  const today = todayStr();

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  /* -------------------------------- the day -------------------------------- */

  const { timed, tray } = useMemo(() => {
    const mine = visibleTasks(tasks, projects).filter((t) =>
      t.status === "done"
        ? t.completedAt != null && localDateOf(t.completedAt) === today
        : t.doDate != null && t.doDate <= today,
    );
    return {
      timed: mine
        .filter((t) => t.doTime != null)
        .sort((a, b) => (parseHM(a.doTime!) ?? 0) - (parseHM(b.doTime!) ?? 0)),
      tray: mine
        .filter((t) => t.doTime == null)
        .sort(
          (a, b) =>
            Number(a.status === "done") - Number(b.status === "done") ||
            a.sortOrder - b.sortOrder,
        ),
    };
  }, [tasks, projects, today]);

  /* -------------------------------- dragging -------------------------------- */

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setDrag = (d: DragState | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  const [qc, setQc] = useState<QuickCreateSpec | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; task: Task } | null>(null);

  /** Raw minute-of-day for a clientY against the grid content. */
  const yToMin = (clientY: number): number => {
    const r = contentRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return ((clientY - r.top) / HOUR_PX) * 60;
  };

  const zoneAt = (x: number, y: number): { kind: Zone; min: number } => {
    const tr = trayRef.current?.getBoundingClientRect();
    if (tr && x >= tr.left && x <= tr.right && y >= tr.top && y <= tr.bottom) {
      return { kind: "tray", min: 0 };
    }
    const grid = contentRef.current?.getBoundingClientRect();
    const sc = scrollRef.current?.getBoundingClientRect();
    if (grid && sc && x >= grid.left && x <= grid.right && y >= sc.top && y <= sc.bottom) {
      return { kind: "grid", min: clamp(yToMin(y), 0, DAY_MIN - 1) };
    }
    return { kind: "out", min: 0 };
  };

  const startDrag = (
    e: React.PointerEvent,
    init: Pick<
      DragState,
      "mode" | "task" | "grabOffsetMin" | "anchorMin" | "origStart" | "origDur" | "zone" | "startMin" | "durMin"
    >,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setQc(null);
    setDrag({
      ...init,
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
        if (z.kind === "grid") {
          const cur = snapRound(clamp(z.min, 0, DAY_MIN));
          const start = Math.min(snapFloor(d.anchorMin), cur);
          const end = Math.max(Math.max(snapFloor(d.anchorMin), cur), start + SNAP);
          next = { ...next, startMin: start, durMin: end - start };
        }
      } else if (d.mode === "resize-end") {
        const end = clamp(snapRound(yToMin(e.clientY)), d.origStart + SNAP, DAY_MIN);
        next = { ...next, startMin: d.origStart, durMin: end - d.origStart };
      } else if (d.mode === "resize-start") {
        const origEnd = d.origStart + d.origDur;
        const start = clamp(snapRound(yToMin(e.clientY)), 0, origEnd - SNAP);
        next = { ...next, startMin: start, durMin: origEnd - start };
      } else if (z.kind === "grid") {
        const start = clamp(snapRound(z.min - d.grabOffsetMin), 0, DAY_MIN - d.durMin);
        next = { ...next, zone: "grid", startMin: start };
      } else if (z.kind === "tray" && d.mode === "move") {
        next = { ...next, zone: "tray" };
      } else {
        next = { ...next, zone: "out" };
      }

      // Edge auto-scroll while the pointer rides the grid.
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
        if ((d.mode === "move" || d.mode === "external") && d.task) openDetail(d.task.id);
        else if (d.mode === "create") {
          const start = clamp(snapFloor(d.anchorMin), 0, DAY_MIN - 60);
          setQc({ startMin: start, durMin: 60, x: d.pointerX + 10, y: d.pointerY + 6 });
        }
        return;
      }

      switch (d.mode) {
        case "create":
          if (d.zone === "grid") {
            setQc({
              startMin: d.startMin,
              durMin: d.durMin,
              x: d.pointerX + 10,
              y: d.pointerY + 6,
            });
          }
          break;
        case "move":
        case "external":
          if (!d.task) break;
          if (d.zone === "grid") {
            data.updateTask(d.task.id, {
              doDate: today,
              doTime: minutesToHM(d.startMin),
              durationMinutes: d.durMin,
            });
          } else if (d.zone === "tray" && d.mode === "move") {
            data.updateTask(d.task.id, { doDate: today, doTime: null });
            toast("Back to anytime today", "info");
          }
          break;
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

  /* ----------------------------- initial scroll ----------------------------- */

  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    sc.scrollTop = clamp(((nowMin - 90) / 60) * HOUR_PX, 0, GRID_H - sc.clientHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------- blocks ---------------------------------- */

  const placed: Placed[] = [];
  for (const t of timed) {
    if (
      drag?.moved &&
      drag.task?.id === t.id &&
      (drag.mode === "move" || drag.mode === "resize-start" || drag.mode === "resize-end")
    ) {
      continue; // original hides while its ghost rides the pointer
    }
    placed.push({ key: t.id, task: t, start: parseHM(t.doTime!) ?? 0, dur: blockDuration(t) });
  }
  if (drag?.moved && drag.zone === "grid") {
    if (drag.mode === "create") {
      placed.push({ key: "__create", task: null, start: drag.startMin, dur: drag.durMin, pending: true });
    } else if (drag.task) {
      placed.push({ key: "__ghost", task: drag.task, start: drag.startMin, dur: drag.durMin, ghost: true });
    }
  }
  if (qc) placed.push({ key: "__qc", task: null, start: qc.startMin, dur: qc.durMin, pending: true });

  const lay = layoutOverlaps(placed);

  const createFromQc = (title: string) => {
    if (!qc) return;
    useData.getState().addTask({
      title: title.trim() || "New task",
      projectId: null,
      priority: settings.defaultPriority,
      doDate: today,
      doTime: minutesToHM(qc.startMin),
      durationMinutes: qc.durMin,
    });
    setQc(null);
  };

  const floatingDrag = drag?.moved && drag.task && (drag.zone === "tray" || drag.zone === "out");
  const scheduledMinutes = timed.reduce((a, t) => a + blockDuration(t), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ------------------------------ unscheduled ------------------------------ */}
      <div
        ref={trayRef}
        className={cn(
          "shrink-0 border-y border-bord bg-panel/40 px-8 py-2.5 transition-colors",
          drag?.moved && drag.zone === "tray" && "bg-accent/[0.07] ring-2 ring-inset ring-accent/50",
        )}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3">
            Anytime today · {tray.filter((t) => t.status !== "done").length}
          </span>
          <span className="text-[11.5px] text-ink3/80">
            drag onto the grid to give it a time
          </span>
        </div>
        {tray.length === 0 ? (
          <p className="mt-1.5 text-[12px] text-ink3">
            Everything planned for today has a time on it.
          </p>
        ) : (
          <div className="mt-1.5 flex max-h-[92px] flex-wrap gap-1.5 overflow-y-auto">
            {tray.map((t) => {
              const color = projectColorOf(t, projects, settings.accentColor);
              const done = t.status === "done";
              return (
                <div
                  key={t.id}
                  onPointerDown={(e) =>
                    done
                      ? undefined
                      : startDrag(e, {
                          mode: "external",
                          task: t,
                          grabOffsetMin: 0,
                          anchorMin: 0,
                          origStart: 0,
                          origDur: blockDuration(t),
                          zone: "out",
                          startMin: snapFloor(clamp(nowMin, 0, DAY_MIN - 60)),
                          durMin: blockDuration(t),
                        })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, task: t });
                  }}
                  style={{ background: tint(color, dark), borderLeftColor: color }}
                  className={cn(
                    "flex max-w-[280px] items-center gap-1.5 rounded-md border-l-[3px] px-2 py-1 text-[12px] text-ink shadow-card transition-all",
                    done ? "opacity-50 line-through" : "cursor-grab hover:shadow-cardHover",
                    drag?.moved && drag.task?.id === t.id && "opacity-30",
                    detailTaskId === t.id && "ring-2 ring-accent",
                  )}
                  title={t.title}
                >
                  {t.priority && (
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_META[t.priority].dot)} />
                  )}
                  <span className="truncate font-medium">{t.title}</span>
                  {t.estimateMinutes != null && t.estimateMinutes > 0 && (
                    <span className="shrink-0 text-[10.5px] text-ink3">
                      {formatMinutes(t.estimateMinutes)}
                    </span>
                  )}
                  {t.dueDate && t.dueDate < today && (
                    <span className="shrink-0 text-[10.5px] font-medium text-red-500">
                      due {relativeDayLabel(t.dueDate)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* -------------------------------- the grid ------------------------------- */}
      <div className="flex shrink-0 items-center gap-2 px-8 py-1.5 text-[11.5px] text-ink3">
        <IconClock size={12} />
        <span>
          {timed.length === 0
            ? "Nothing time-blocked yet — drag a task down, or drag on the grid to draw a block."
            : `${timed.length} block${timed.length === 1 ? "" : "s"} · ~${formatMinutes(scheduledMinutes)} scheduled`}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div
          ref={contentRef}
          className="relative ml-[58px]"
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
              startMin: snapFloor(z.min),
              durMin: SNAP,
            });
          }}
        >
          {/* hour lines + labels */}
          {Array.from({ length: 25 }, (_, h) => (
            <div key={h}>
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 border-t",
                  h % 24 === 0 ? "border-transparent" : "border-bord/60",
                )}
                style={{ top: h * HOUR_PX }}
              />
              {h < 24 && h > 0 && (
                <span
                  className="pointer-events-none absolute select-none text-right text-[10px] tabular-nums text-ink3"
                  style={{ top: h * HOUR_PX - 7, left: -GUTTER, width: GUTTER - 12 }}
                >
                  {formatClock(h * 60)}
                </span>
              )}
            </div>
          ))}

          {/* working-hours tint keeps the eye on the part of the day that matters */}
          <div
            className="pointer-events-none absolute inset-x-0 rounded-md bg-ink/[0.015] dark:bg-white/[0.02]"
            style={{ top: 8 * HOUR_PX, height: 10 * HOUR_PX }}
          />

          {placed.map((p) => (
            <EventBlock
              key={p.key}
              placed={p}
              lay={lay.get(p.key) ?? { col: 0, cols: 1 }}
              color={projectColorOf(p.task, projects, settings.accentColor)}
              dark={dark}
              selected={p.task != null && detailTaskId === p.task.id}
              onToggleDone={
                p.task
                  ? () => {
                      const t = p.task!;
                      if (t.status === "done") useData.getState().updateTask(t.id, { status: "todo" });
                      else useData.getState().completeTask(t.id);
                    }
                  : undefined
              }
              onPointerDownMove={
                p.task && !p.ghost
                  ? (e) =>
                      startDrag(e, {
                        mode: "move",
                        task: p.task!,
                        grabOffsetMin: yToMin(e.clientY) - p.start,
                        anchorMin: yToMin(e.clientY),
                        origStart: p.start,
                        origDur: p.dur,
                        zone: "grid",
                        startMin: p.start,
                        durMin: p.dur,
                      })
                  : undefined
              }
              onPointerDownResize={
                p.task && !p.ghost
                  ? (e, edge) =>
                      startDrag(e, {
                        mode: edge === "start" ? "resize-start" : "resize-end",
                        task: p.task!,
                        grabOffsetMin: 0,
                        anchorMin: yToMin(e.clientY),
                        origStart: p.start,
                        origDur: p.dur,
                        zone: "grid",
                        startMin: p.start,
                        durMin: p.dur,
                      })
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

          {/* now line */}
          <div
            className="pointer-events-none absolute inset-x-0 z-20"
            style={{ top: (nowMin / 60) * HOUR_PX }}
          >
            <div className="relative h-[2px] bg-red-500">
              <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-full bg-red-500" />
              <span
                className="absolute -top-[7px] text-right text-[9px] font-semibold tabular-nums text-red-500"
                style={{ left: -GUTTER, width: GUTTER - 10 }}
              >
                {formatClock(nowMin).replace(" ", "")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* floating pill while dragging off the grid */}
      {floatingDrag &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] flex h-[28px] max-w-[240px] items-center gap-1.5 rounded-lg border border-bord bg-pop px-2.5 shadow-pop"
            style={{ left: drag!.pointerX + 12, top: drag!.pointerY + 8 }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: projectColorOf(drag!.task, projects, settings.accentColor) }}
            />
            <span className="truncate text-[12px] font-medium text-ink">{drag!.task!.title}</span>
            {drag!.zone === "tray" && (
              <span className="shrink-0 text-[10.5px] text-ink3">clear time</span>
            )}
          </div>,
          document.body,
        )}

      {qc && <QuickCreatePopover spec={qc} onCreate={createFromQc} onClose={() => setQc(null)} />}

      {menu && (
        <FloatingMenu
          x={menu.x}
          y={menu.y}
          items={taskMenuItems(menu.task)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
