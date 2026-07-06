import { useMemo, useState } from "react";
import type { Goal, Priority, Task, TaskStatus } from "../types";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import {
  activeGoals,
  goalProgress,
  goalTasks,
  isOpen,
  projectTasks,
  STATUS_LABEL,
  statusColumns,
  workloadMinutes,
} from "../stores/selectors";
import { cn, daysUntil, formatMinutes, plural, PRIORITY_META } from "../lib/util";
import { TaskBoard } from "../components/TaskBoard";
import { TaskCard } from "../components/TaskCard";
import { ViewShell } from "../components/ViewShell";
import { Doughnut } from "../components/charts";
import { Button, EmptyState, ProgressRing, Segmented, Select } from "../components/ui/primitives";
import { IconBoard, IconList, IconPencil, IconPlus, IconTarget } from "../components/icons";

function GoalStripCard({ goal }: { goal: Goal }) {
  const tasks = useData((s) => s.tasks);
  const milestones = useData((s) => s.milestones);
  const go = useUI((s) => s.go);
  const pct = goalProgress(goal, tasks, milestones);
  const left = daysUntil(goal.targetDate);
  const linked = goalTasks(tasks, goal.id).length;

  return (
    <button
      onClick={() => go({ name: "goal", goalId: goal.id })}
      className="group flex shrink-0 items-center gap-3 rounded-xl border border-bord bg-card px-3.5 py-2.5 text-left shadow-card transition-all hover:border-bord2 hover:shadow-cardHover"
    >
      <ProgressRing pct={pct} size={38} stroke={4} />
      <div className="min-w-0">
        <p className="max-w-[200px] truncate text-[13px] font-medium text-ink">{goal.title}</p>
        <p
          className={cn(
            "mt-0.5 text-[11.5px]",
            left <= 2 ? "text-red-500 font-medium" : left <= 7 ? "text-orange-500 font-medium" : "text-ink3",
          )}
        >
          {left < 0
            ? `${-left}d overdue`
            : left === 0
              ? "Due today"
              : `${left}d left`}
          {" · "}
          {plural(linked, "task")}
        </p>
      </div>
    </button>
  );
}

export function ProjectView({ projectId }: { projectId: string }) {
  const projects = useData((s) => s.projects);
  const goals = useData((s) => s.goals);
  const allTasks = useData((s) => s.tasks);
  const addTask = useData((s) => s.addTask);
  const settings = useSettings((s) => s.settings);
  const setViewPref = useSettings((s) => s.setViewPref);
  const setProjectModal = useUI((s) => s.setProjectModal);
  const setGoalModal = useUI((s) => s.setGoalModal);

  const [filterPriority, setFilterPriority] = useState("");
  const [filterGoal, setFilterGoal] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDue, setFilterDue] = useState("");
  const [groupBy, setGroupBy] = useState<"status" | "priority">("status");

  const project = projects.find((p) => p.id === projectId);
  const layout = (settings.viewPrefs[`layout:${projectId}`] ?? "board") as "board" | "list";

  const tasks = useMemo(() => projectTasks(allTasks, projectId), [allTasks, projectId]);
  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (filterPriority === "none" ? t.priority !== null : filterPriority && t.priority !== filterPriority) return false;
        if (filterGoal && t.goalId !== filterGoal) return false;
        if (filterStatus && t.status !== filterStatus) return false;
        if (filterDue === "has" && !t.dueDate) return false;
        if (filterDue === "none" && t.dueDate) return false;
        return true;
      }),
    [tasks, filterPriority, filterGoal, filterStatus, filterDue],
  );

  if (!project) {
    return (
      <ViewShell title="Project">
        <EmptyState title="Project not found" hint="It may have been archived or deleted." />
      </ViewShell>
    );
  }

  const open = tasks.filter(isOpen);
  const done = tasks.filter((t) => t.status === "done");
  const openMinutes = workloadMinutes(open);
  const projGoals = activeGoals(goals.filter((g) => g.projectId === projectId));
  const filtersActive = filterPriority || filterGoal || filterStatus || filterDue;

  return (
    <ViewShell
      title={
        <span className="flex items-center gap-2.5 group">
          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: project.color }} />
          <span className="truncate">
            {project.icon ? `${project.icon} ` : ""}
            {project.name}
          </span>
          <button
            onClick={() => setProjectModal({ projectId })}
            className="rounded-md p-1 text-ink3 opacity-0 transition-all hover:bg-ink/5 hover:text-ink group-hover:opacity-100"
            title="Edit project"
          >
            <IconPencil size={13} />
          </button>
        </span>
      }
      meta={
        <>
          {plural(open.length, "open task")}
          {openMinutes > 0 && <> · ~{formatMinutes(openMinutes)} remaining</>}
          {done.length > 0 && <> · {done.length} done</>}
        </>
      }
      actions={
        <>
          <Button variant="secondary" icon={<IconTarget size={13} />} onClick={() => setGoalModal({ projectId })}>
            New goal
          </Button>
          <Segmented
            value={layout}
            onChange={(v) => setViewPref(`layout:${projectId}`, v)}
            options={[
              { value: "board", label: <IconBoard size={13} />, title: "Board" },
              { value: "list", label: <IconList size={13} />, title: "List" },
            ]}
          />
        </>
      }
      padContent={false}
      contentClassName="flex flex-col"
    >
      {/* header strip: chart + goals */}
      {(projGoals.length > 0 || tasks.length > 0) && (
        <div className="flex items-center gap-3 overflow-x-auto px-8 pb-4 shrink-0">
          {tasks.length > 0 && (
            <div className="flex shrink-0 items-center gap-3 rounded-xl border border-bord bg-card px-3.5 py-2.5 shadow-card">
              <Doughnut done={done.length} total={tasks.length} size={44} thickness={6} />
              <div>
                <p className="text-[13px] font-medium text-ink">Completion</p>
                <p className="mt-0.5 text-[11.5px] text-ink3">
                  {done.length} of {plural(tasks.length, "task")}
                </p>
              </div>
            </div>
          )}
          {projGoals.map((g) => (
            <GoalStripCard key={g.id} goal={g} />
          ))}
        </div>
      )}

      {/* filter bar */}
      <div className="flex items-center gap-2 px-8 pb-3 shrink-0">
        <Select
          value={filterPriority}
          onChange={setFilterPriority}
          placeholder="Priority"
          className="h-[26px] text-[12px]"
          options={[
            { value: "P1", label: "High" },
            { value: "P2", label: "Medium" },
            { value: "P3", label: "Low" },
            { value: "none", label: "No priority" },
          ]}
        />
        <Select
          value={filterStatus}
          onChange={setFilterStatus}
          placeholder="Status"
          className="h-[26px] text-[12px]"
          options={statusColumns(settings.blockedEnabled).map((st) => ({
            value: st,
            label: STATUS_LABEL[st],
          }))}
        />
        {projGoals.length > 0 && (
          <Select
            value={filterGoal}
            onChange={setFilterGoal}
            placeholder="Goal"
            className="h-[26px] max-w-[180px] text-[12px]"
            options={projGoals.map((g) => ({ value: g.id, label: g.title }))}
          />
        )}
        <Select
          value={filterDue}
          onChange={setFilterDue}
          placeholder="Due date"
          className="h-[26px] text-[12px]"
          options={[
            { value: "has", label: "Has due date" },
            { value: "none", label: "No due date" },
          ]}
        />
        {filtersActive && (
          <button
            onClick={() => {
              setFilterPriority("");
              setFilterGoal("");
              setFilterStatus("");
              setFilterDue("");
            }}
            className="text-[12px] text-accent hover:underline"
          >
            Clear
          </button>
        )}
        {layout === "list" && (
          <div className="ml-auto flex items-center gap-1.5 text-[12px] text-ink3">
            Group by
            <Segmented
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: "status", label: "Status" },
                { value: "priority", label: "Priority" },
              ]}
            />
          </div>
        )}
      </div>

      {/* content */}
      <div className="min-h-0 flex-1 px-8 pb-8">
        {tasks.length === 0 ? (
          <EmptyState
            icon={<IconBoard size={28} />}
            title="No tasks yet"
            hint="Add the first task below, or drag notes from your Inbox onto this project in the sidebar."
            action={
              <Button
                variant="primary"
                icon={<IconPlus size={13} />}
                onClick={() => {
                  const title = "New task";
                  const t = addTask({ title, projectId, priority: settings.defaultPriority });
                  useUI.getState().openDetail(t.id);
                }}
              >
                Add task
              </Button>
            }
          />
        ) : layout === "board" ? (
          <TaskBoard
            tasks={filtered}
            sprintId={null}
            onQuickAdd={(title) =>
              addTask({ title, projectId, priority: settings.defaultPriority })
            }
          />
        ) : (
          <ProjectList tasks={filtered} groupBy={groupBy} projectId={projectId} />
        )}
      </div>
    </ViewShell>
  );
}

function ProjectList({
  tasks,
  groupBy,
  projectId,
}: {
  tasks: Task[];
  groupBy: "status" | "priority";
  projectId: string;
}) {
  const settings = useSettings((s) => s.settings);
  const addTask = useData((s) => s.addTask);
  const [sort, setSort] = useState<"manual" | "due" | "priority" | "newest">("manual");
  const [adding, setAdding] = useState("");

  const groups: { key: string; label: string; tasks: Task[] }[] = [];
  const sortFn = (a: Task, b: Task) => {
    switch (sort) {
      case "due":
        return (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : 1;
      case "priority": {
        const rank = (t: Task) => (t.priority ? Number(t.priority[1]) : 9);
        return rank(a) - rank(b);
      }
      case "newest":
        return a.createdAt < b.createdAt ? 1 : -1;
      default:
        return a.sortOrder - b.sortOrder;
    }
  };

  if (groupBy === "status") {
    for (const st of statusColumns(settings.blockedEnabled)) {
      const list = tasks.filter((t) => t.status === st).sort(sortFn);
      if (st === "done" && list.length === 0) continue;
      groups.push({ key: st, label: STATUS_LABEL[st as TaskStatus], tasks: list });
    }
  } else {
    for (const pr of ["P1", "P2", "P3", null] as (Priority | null)[]) {
      const list = tasks.filter((t) => t.priority === pr && t.status !== "done").sort(sortFn);
      groups.push({
        key: pr ?? "none",
        label: pr ? `${PRIORITY_META[pr].label} priority` : "No priority",
        tasks: list,
      });
    }
    const doneList = tasks.filter((t) => t.status === "done").sort(sortFn);
    if (doneList.length > 0) groups.push({ key: "done", label: "Done", tasks: doneList });
  }

  return (
    <div className="max-w-[760px]">
      <div className="mb-3 flex items-center justify-end gap-1.5 text-[12px] text-ink3">
        Sort
        <Select
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
          className="h-[26px] text-[12px]"
          options={[
            { value: "manual", label: "Manual" },
            { value: "due", label: "Due date" },
            { value: "priority", label: "Priority" },
            { value: "newest", label: "Newest" },
          ]}
        />
      </div>
      {groups.map(
        (g) =>
          (g.tasks.length > 0 || g.key === "todo") && (
            <div key={g.key} className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3">
                  {g.label}
                </span>
                <span className="text-[11px] tabular-nums text-ink3/70">{g.tasks.length}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {g.tasks.map((t) => (
                  <TaskCard key={t.id} task={t} dense />
                ))}
                {g.key === "todo" && (
                  <input
                    value={adding}
                    onChange={(e) => setAdding(e.target.value)}
                    onBlur={() => {
                      if (adding.trim()) {
                        addTask({ title: adding, projectId, priority: settings.defaultPriority });
                        setAdding("");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && adding.trim()) {
                        addTask({ title: adding, projectId, priority: settings.defaultPriority });
                        setAdding("");
                      }
                      if (e.key === "Escape") {
                        setAdding("");
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="+ New task"
                    className="rounded-lg border border-transparent px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink3 hover:border-bord focus:border-accent/50 focus:bg-card"
                  />
                )}
              </div>
            </div>
          ),
      )}
    </div>
  );
}
