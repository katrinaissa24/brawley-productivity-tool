import { useRef, useState } from "react";
import { SortableContext } from "@dnd-kit/sortable";
import { noSortingStrategy } from "../lib/collision";
import type { Task, TaskStatus } from "../types";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { activeSprint, countInProgress, STATUS_LABEL, statusColumns } from "../stores/selectors";
import { cn, plural } from "../lib/util";
import { DroppableColumn, SortableTask } from "./dnd";
import { TaskCard } from "./TaskCard";
import { FloatingMenu, type MenuItem } from "./ui/primitives";
import { IconArchive, IconPlus, IconTrash } from "./icons";

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const cancelled = useRef(false);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-ink3 transition-colors hover:bg-ink/5 hover:text-ink2"
      >
        <IconPlus size={12} /> New task
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        // Clicking away saves what you typed — Esc is the explicit cancel.
        if (!cancelled.current && value.trim()) onAdd(value);
        cancelled.current = false;
        setEditing(false);
        setValue("");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) {
          onAdd(value);
          setValue("");
        }
        if (e.key === "Escape") {
          cancelled.current = true;
          setEditing(false);
          setValue("");
        }
      }}
      placeholder="Task title — Enter to add"
      className="rounded-lg border border-accent/50 bg-card px-2.5 py-2 text-[13px] text-ink outline-none ring-2 ring-accent/15 placeholder:text-ink3"
    />
  );
}

interface ColumnSpec {
  key: string;
  label: string;
  status: TaskStatus;
  dot: string;
  sprintId: string | null;
  unassign?: boolean;
  quickAdd?: boolean;
  filter: (t: Task) => boolean;
}

/**
 * Status-column board shared by Project and Sprint views.
 * `tasks` should already be scoped (project or sprint) and exclude archived.
 *
 * Project boards (`projectBoard`) get a leading Backlog column: To Do means
 * "committed to the active sprint"; Backlog is everything not yet committed.
 */
export function TaskBoard({
  tasks,
  sprintId,
  showProject,
  projectBoard,
  onQuickAdd,
}: {
  tasks: Task[];
  sprintId: string | null;
  showProject?: boolean;
  projectBoard?: boolean;
  onQuickAdd?: (title: string, status: TaskStatus) => void;
}) {
  const settings = useSettings((s) => s.settings);
  const sprints = useData((s) => s.sprints);
  const wipCount = useData((s) => countInProgress(s.tasks, s.projects));
  const draggingIds = useUI((s) => s.draggingIds);
  const [colMenu, setColMenu] = useState<{ x: number; y: number; label: string; tasks: Task[] } | null>(null);
  const retentionDays = settings.boardDoneRetentionDays;

  const active = activeSprint(sprints);
  const statuses = statusColumns(settings.blockedEnabled);

  const columnMenuItems = (label: string, colTasks: Task[]): MenuItem[] => {
    const ui = useUI.getState();
    const data = useData.getState();
    const n = colTasks.length;
    return [
      {
        label: `Archive all · ${n}`,
        icon: <IconArchive size={14} />,
        disabled: n === 0,
        onSelect: () =>
          ui.ask({
            title: `Archive ${n} task${n === 1 ? "" : "s"}?`,
            message: `Everything in "${label}" moves to the archive — restorable anytime from Settings → Archive.`,
            confirmLabel: "Archive all",
            onConfirm: () => {
              for (const t of colTasks) data.archiveTask(t.id);
              ui.toast(`Archived ${n} task${n === 1 ? "" : "s"}`, "success");
            },
          }),
      },
      {
        label: `Delete all · ${n}`,
        icon: <IconTrash size={14} />,
        danger: true,
        disabled: n === 0,
        onSelect: () =>
          ui.ask({
            title: `Delete ${n} task${n === 1 ? "" : "s"} permanently?`,
            message: `Everything in "${label}" will be gone for good. Archiving keeps things recoverable.`,
            confirmLabel: "Delete all",
            danger: true,
            onConfirm: () => {
              for (const t of colTasks) data.deleteTaskHard(t.id);
            },
          }),
      },
    ];
  };

  const columns: ColumnSpec[] = [];
  if (projectBoard) {
    columns.push({
      key: "backlog",
      label: "Backlog",
      status: "todo",
      dot: "bg-zinc-300 dark:bg-zinc-600",
      sprintId: null,
      unassign: true,
      quickAdd: true,
      filter: (t) => t.status === "todo" && (!active || t.sprintId !== active.id),
    });
    columns.push({
      key: "todo",
      label: STATUS_LABEL.todo,
      status: "todo",
      dot: "bg-zinc-400",
      sprintId: active?.id ?? null,
      filter: (t) => t.status === "todo" && !!active && t.sprintId === active.id,
    });
    for (const st of statuses) {
      if (st === "todo") continue;
      columns.push({
        key: st,
        label: STATUS_LABEL[st],
        status: st,
        dot:
          st === "in_progress"
            ? "bg-accent"
            : st === "blocked"
              ? "bg-red-500"
              : "bg-emerald-500",
        sprintId: active?.id ?? null,
        filter: (t) => t.status === st,
      });
    }
  } else {
    for (const st of statuses) {
      columns.push({
        key: st,
        label: STATUS_LABEL[st],
        status: st,
        dot:
          st === "todo"
            ? "bg-zinc-400"
            : st === "in_progress"
              ? "bg-accent"
              : st === "blocked"
                ? "bg-red-500"
                : "bg-emerald-500",
        sprintId,
        quickAdd: st === "todo",
        filter: (t) => t.status === st,
      });
    }
  }

  return (
    <div className="flex h-full min-w-0 gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        let colTasks = tasks.filter(col.filter).sort((a, b) => a.sortOrder - b.sortOrder);
        const allInColumn = colTasks;
        let hiddenDone = 0;
        if (col.status === "done") {
          // Done stays visible until archived (default). A positive retention
          // hides older completions; -1 hides them immediately.
          colTasks =
            retentionDays === 0
              ? [...allInColumn]
              : retentionDays < 0
                ? []
                : allInColumn.filter(
                    (t) =>
                      t.completedAt &&
                      Date.now() - new Date(t.completedAt).getTime() <= retentionDays * 864e5,
                  );
          colTasks.sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1));
          hiddenDone = allInColumn.length - colTasks.length;
        }
        // Lifted (dragging) tasks stay mounted but leave the sortable order.
        const ids = colTasks.filter((t) => !draggingIds.includes(t.id)).map((t) => t.id);
        const atWip =
          col.status === "in_progress" && settings.wipLimitEnabled && wipCount >= settings.wipLimit;

        return (
          <DroppableColumn
            key={col.key}
            id={`${projectBoard ? "pb" : "sb"}:${col.key}`}
            status={col.status}
            sprintId={col.sprintId}
            unassign={col.unassign}
            listIds={ids}
            className="flex h-full w-[272px] shrink-0 flex-col"
          >
            {(isOver) => (
              <div
                className={cn(
                  "flex max-h-full flex-col rounded-xl border bg-panel/50 transition-all duration-150",
                  isOver ? "border-accent/50 ring-2 ring-accent/20 bg-accent/[0.04]" : "border-bord/70",
                )}
              >
                <div
                  className="flex items-center gap-2 px-3 pb-1 pt-2.5"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setColMenu({ x: e.clientX, y: e.clientY, label: col.label, tasks: allInColumn });
                  }}
                  title="Right-click for column actions"
                >
                  <span className={cn("h-2 w-2 rounded-full", col.dot)} />
                  <span className="text-[12.5px] font-semibold text-ink2">{col.label}</span>
                  <span className="text-[11.5px] tabular-nums text-ink3">
                    {col.status === "done" ? colTasks.length + hiddenDone : colTasks.length}
                  </span>
                  {col.status === "in_progress" && settings.wipLimitEnabled && (
                    <span
                      className={cn(
                        "ml-auto rounded-md px-1.5 py-0.5 text-[10.5px] font-medium",
                        atWip ? "bg-orange-500/15 text-orange-600 dark:text-orange-400" : "bg-panel text-ink3",
                      )}
                      title="Work-in-progress limit"
                    >
                      WIP {wipCount}/{settings.wipLimit}
                    </span>
                  )}
                </div>
                <SortableContext items={ids} strategy={noSortingStrategy}>
                  <div className="flex min-h-[60px] flex-col gap-2 overflow-y-auto p-2">
                    {colTasks.map((t) => (
                      <SortableTask key={t.id} task={t} listIds={ids}>
                        <TaskCard task={t} showProject={showProject} />
                      </SortableTask>
                    ))}
                    {col.status === "done" && hiddenDone > 0 && (
                      <p className="px-2 py-1.5 text-[11.5px] leading-relaxed text-ink3">
                        {plural(hiddenDone, "completed task")} tucked away — see Settings → Archive.
                      </p>
                    )}
                    {col.quickAdd && onQuickAdd && (
                      <QuickAdd onAdd={(title) => onQuickAdd(title, col.status)} />
                    )}
                  </div>
                </SortableContext>
              </div>
            )}
          </DroppableColumn>
        );
      })}
      {colMenu && (
        <FloatingMenu
          x={colMenu.x}
          y={colMenu.y}
          items={columnMenuItems(colMenu.label, colMenu.tasks)}
          onClose={() => setColMenu(null)}
        />
      )}
    </div>
  );
}
