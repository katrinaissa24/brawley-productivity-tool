import { useRef, useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Task, TaskStatus } from "../types";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { STATUS_LABEL, statusColumns } from "../stores/selectors";
import { cn, plural } from "../lib/util";
import { DroppableColumn, SortableTask } from "./dnd";
import { TaskCard } from "./TaskCard";
import { IconPlus } from "./icons";

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

/**
 * Status-column board shared by Project and Sprint views.
 * `tasks` should already be scoped (project or sprint) and exclude archived.
 */
export function TaskBoard({
  tasks,
  sprintId,
  showProject,
  onQuickAdd,
}: {
  tasks: Task[];
  sprintId: string | null;
  showProject?: boolean;
  onQuickAdd?: (title: string, status: TaskStatus) => void;
}) {
  const settings = useSettings((s) => s.settings);
  const wipCount = useData((s) =>
    s.tasks.filter((t) => t.status === "in_progress" && !t.archivedAt).length,
  );
  const draggingIds = useUI((s) => s.draggingIds);
  const columns = statusColumns(settings.blockedEnabled);
  const retentionMs = settings.boardDoneRetentionDays * 864e5;

  return (
    <div className="flex h-full min-w-0 gap-3 overflow-x-auto pb-2">
      {columns.map((status) => {
        let colTasks = tasks
          .filter((t) => t.status === status && !draggingIds.includes(t.id))
          .sort((a, b) => a.sortOrder - b.sortOrder);
        let hiddenDone = 0;
        if (status === "done") {
          const all = colTasks;
          colTasks = all
            .filter(
              (t) =>
                t.completedAt &&
                Date.now() - new Date(t.completedAt).getTime() <= Math.max(retentionMs, 0),
            )
            .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1));
          if (settings.boardDoneRetentionDays === 0) colTasks = [];
          hiddenDone = all.length - colTasks.length;
        }
        const ids = colTasks.map((t) => t.id);
        const atWip =
          status === "in_progress" && settings.wipLimitEnabled && wipCount >= settings.wipLimit;

        return (
          <DroppableColumn
            key={status}
            status={status}
            sprintId={sprintId}
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
                <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      status === "todo" && "bg-zinc-400",
                      status === "in_progress" && "bg-accent",
                      status === "blocked" && "bg-red-500",
                      status === "done" && "bg-emerald-500",
                    )}
                  />
                  <span className="text-[12.5px] font-semibold text-ink2">{STATUS_LABEL[status]}</span>
                  <span className="text-[11.5px] tabular-nums text-ink3">
                    {status === "done" ? colTasks.length + hiddenDone : colTasks.length}
                  </span>
                  {status === "in_progress" && settings.wipLimitEnabled && (
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
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  <div className="flex min-h-[60px] flex-col gap-2 overflow-y-auto p-2">
                    {colTasks.map((t) => (
                      <SortableTask key={t.id} task={t} listIds={ids}>
                        <TaskCard task={t} showProject={showProject} />
                      </SortableTask>
                    ))}
                    {status === "done" && hiddenDone > 0 && (
                      <p className="px-2 py-1.5 text-[11.5px] leading-relaxed text-ink3">
                        {plural(hiddenDone, "completed task")} tucked away — see Settings → Archive.
                      </p>
                    )}
                    {status === "todo" && onQuickAdd && (
                      <QuickAdd onAdd={(title) => onQuickAdd(title, status)} />
                    )}
                  </div>
                </SortableContext>
              </div>
            )}
          </DroppableColumn>
        );
      })}
    </div>
  );
}
