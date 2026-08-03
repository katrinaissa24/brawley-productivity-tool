import { useMemo, useState } from "react";
import { marked } from "marked";
import type { Goal, GoalStatus } from "../types";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { goalProgress, goalTasks, isOpen, sortedGoals } from "../stores/selectors";
import { cn, daysUntil, formatDateShort, formatMinutes, plural } from "../lib/util";
import { TaskCard } from "../components/TaskCard";
import { ViewShell } from "../components/ViewShell";
import { MilestoneRow } from "./GoalView";
import {
  Button,
  EmptyState,
  ProgressBar,
  ProgressRing,
  Segmented,
  SectionLabel,
} from "../components/ui/primitives";
import {
  IconArrowRight,
  IconCheckCircle,
  IconPencil,
  IconPlus,
  IconTarget,
  IconTrash,
  IconX,
} from "../components/icons";

marked.setOptions({ gfm: true, breaks: true });

type Filter = "active" | "completed" | "all";

const STATUS_CHIP: Record<GoalStatus, { label: string; className: string } | null> = {
  active: null,
  completed: {
    label: "Completed",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  missed: { label: "Missed", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  archived: { label: "Archived", className: "bg-zinc-500/15 text-ink3" },
};

/** Deadline phrasing shared by the list rows and the panel header. */
function deadlineLabel(goal: Goal): { text: string; className?: string } {
  if (goal.status !== "active") return { text: formatDateShort(goal.targetDate) };
  const left = daysUntil(goal.targetDate);
  if (left < 0)
    return { text: `${-left} ${-left === 1 ? "day" : "days"} overdue`, className: "text-red-500 font-medium" };
  if (left === 0) return { text: "Due today", className: "text-orange-500 font-medium" };
  return {
    text: `${left} ${left === 1 ? "day" : "days"} left`,
    className: left <= 7 ? "text-orange-500 font-medium" : undefined,
  };
}

/* --------------------------------- list row -------------------------------- */

function GoalRow({ goal, selected, onSelect }: { goal: Goal; selected: boolean; onSelect: () => void }) {
  const tasks = useData((s) => s.tasks);
  const milestones = useData((s) => s.milestones);
  const projects = useData((s) => s.projects);

  const pct = goalProgress(goal, tasks, milestones);
  const linked = goalTasks(tasks, goal.id);
  const done = linked.filter((t) => t.status === "done").length;
  const project = projects.find((p) => p.id === goal.projectId);
  const dl = deadlineLabel(goal);
  const chip = STATUS_CHIP[goal.status];

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border bg-card px-4 py-3 text-left shadow-card transition-all",
        selected
          ? "border-accent/60 ring-2 ring-accent/15"
          : "border-bord hover:border-bord2 hover:shadow-cardHover",
        goal.status !== "active" && "opacity-75",
      )}
    >
      <div className="flex items-center gap-3.5">
        <ProgressRing pct={pct} size={44} stroke={5} color={project?.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-[14px] font-medium text-ink">{goal.title}</p>
            {chip && (
              <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium", chip.className)}>
                {chip.label}
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink3">
            {project && (
              <>
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: project.color }}
                />
                <span className="max-w-[150px] truncate">{project.name}</span>
                <span className="text-ink3/50">·</span>
              </>
            )}
            <span className={dl.className}>{dl.text}</span>
            <span className="text-ink3/50">·</span>
            <span>
              {done}/{linked.length} tasks
            </span>
            {goal.progressMode === "milestones" && (
              <>
                <span className="text-ink3/50">·</span>
                <span>
                  {milestones.filter((m) => m.goalId === goal.id && m.done).length}/
                  {milestones.filter((m) => m.goalId === goal.id).length} milestones
                </span>
              </>
            )}
          </p>
        </div>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink2">{pct}%</span>
      </div>
      <div className="mt-2.5">
        <ProgressBar pct={pct} color={project?.color} />
      </div>
    </button>
  );
}

/* -------------------------------- side panel ------------------------------- */

function GoalPanel({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const tasks = useData((s) => s.tasks);
  const milestones = useData((s) => s.milestones);
  const projects = useData((s) => s.projects);
  const addTask = useData((s) => s.addTask);
  const addMilestone = useData((s) => s.addMilestone);
  const updateGoal = useData((s) => s.updateGoal);
  const setGoalStatus = useData((s) => s.setGoalStatus);
  const deleteGoalHard = useData((s) => s.deleteGoalHard);
  const settings = useSettings((s) => s.settings);
  const go = useUI((s) => s.go);
  const ask = useUI((s) => s.ask);
  const setGoalModal = useUI((s) => s.setGoalModal);

  const [newTask, setNewTask] = useState("");
  const [newMilestone, setNewMilestone] = useState("");

  const pct = goalProgress(goal, tasks, milestones);
  const linked = useMemo(() => goalTasks(tasks, goal.id), [tasks, goal.id]);
  const goalMilestones = useMemo(
    () => milestones.filter((m) => m.goalId === goal.id).sort((a, b) => a.sortOrder - b.sortOrder),
    [milestones, goal.id],
  );
  const openTasks = linked.filter(isOpen);
  const doneTasks = linked.filter((t) => t.status === "done");
  const project = projects.find((p) => p.id === goal.projectId);
  const dl = deadlineLabel(goal);
  const remaining = openTasks.reduce((a, t) => a + (t.estimateMinutes ?? 0), 0);

  const createTask = (openAfter: boolean) => {
    if (!newTask.trim()) return;
    const t = addTask({
      title: newTask,
      projectId: goal.projectId,
      goalId: goal.id,
      priority: settings.defaultPriority,
    });
    setNewTask("");
    if (openAfter) useUI.getState().openDetail(t.id);
  };

  return (
    <aside className="anim-slide-right flex w-[400px] shrink-0 flex-col border-l border-bord bg-card">
      <div data-tauri-drag-region className="h-[38px] shrink-0" />
      <div className="flex items-start gap-2 px-5 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">
            {goal.title}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink3">
            {project && (
              <>
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: project.color }}
                />
                <span className="max-w-[140px] truncate">{project.name}</span>
                <span className="text-ink3/50">·</span>
              </>
            )}
            <span>Target {formatDateShort(goal.targetDate)}</span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-ink3 transition-colors hover:bg-ink/5 hover:text-ink"
          title="Close"
        >
          <IconX size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {/* progress */}
        <div className="flex items-center gap-4 rounded-xl border border-bord bg-panel/50 px-4 py-3.5">
          <ProgressRing pct={pct} size={64} stroke={7} color={project?.color} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-[13.5px] font-semibold text-ink", dl.className)}>{dl.text}</p>
            <p className="mt-0.5 text-[12px] text-ink2">
              {doneTasks.length}/{linked.length} tasks done
              {remaining > 0 && <> · ~{formatMinutes(remaining)} left</>}
            </p>
            {goal.progressMode === "manual" && goal.status === "active" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={goal.manualProgress}
                  onChange={(e) => updateGoal(goal.id, { manualProgress: Number(e.target.value) })}
                  className="min-w-0 flex-1 accent-[rgb(var(--c-accent))]"
                />
                <span className="text-[12px] font-medium tabular-nums text-ink2">
                  {goal.manualProgress}%
                </span>
              </div>
            )}
          </div>
        </div>

        {goal.description && (
          <div
            className="md-body mt-4 text-[13px] leading-relaxed text-ink2"
            dangerouslySetInnerHTML={{ __html: marked.parse(goal.description) as string }}
          />
        )}

        {/* milestones */}
        {(goal.progressMode === "milestones" || goalMilestones.length > 0) && (
          <div className="mt-5">
            <SectionLabel className="mb-1.5">
              Milestones · {goalMilestones.filter((m) => m.done).length}/{goalMilestones.length}
            </SectionLabel>
            <div className="rounded-xl border border-bord bg-card px-1.5 py-1">
              {goalMilestones.map((m) => (
                <MilestoneRow key={m.id} m={m} />
              ))}
              <div className="flex items-center gap-2.5 px-2 py-1.5">
                <IconPlus size={13} className="shrink-0 text-ink3" />
                <input
                  value={newMilestone}
                  onChange={(e) => setNewMilestone(e.target.value)}
                  onBlur={() => {
                    if (newMilestone.trim()) {
                      addMilestone(goal.id, newMilestone);
                      setNewMilestone("");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newMilestone.trim()) {
                      addMilestone(goal.id, newMilestone);
                      setNewMilestone("");
                    }
                    if (e.key === "Escape") {
                      setNewMilestone("");
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Add milestone"
                  className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink3"
                />
              </div>
            </div>
          </div>
        )}

        {/* tasks */}
        <div className="mt-5">
          <SectionLabel className="mb-1.5">Tasks · {plural(linked.length, "linked task")}</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {openTasks.map((t) => (
              <TaskCard key={t.id} task={t} dense />
            ))}
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onBlur={() => createTask(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createTask(e.metaKey);
                if (e.key === "Escape") {
                  setNewTask("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="+ Add task to this goal"
              className="rounded-lg border border-transparent px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink3 hover:border-bord focus:border-accent/50 focus:bg-card"
            />
            {doneTasks.length > 0 && (
              <>
                <SectionLabel className="mb-0.5 mt-3">Done · {doneTasks.length}</SectionLabel>
                {doneTasks.map((t) => (
                  <TaskCard key={t.id} task={t} dense />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-bord px-5 py-3">
        {goal.status === "active" && (
          <Button
            variant="secondary"
            icon={<IconCheckCircle size={13} />}
            onClick={() =>
              ask({
                title: "Complete goal?",
                message: `Mark "${goal.title}" as achieved. Open linked tasks stay where they are.`,
                confirmLabel: "Complete goal",
                onConfirm: () => setGoalStatus(goal.id, "completed"),
              })
            }
          >
            Complete
          </Button>
        )}
        <Button
          variant="secondary"
          icon={<IconPencil size={13} />}
          onClick={() => setGoalModal({ goalId: goal.id })}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          icon={<IconArrowRight size={13} />}
          onClick={() => go({ name: "goal", goalId: goal.id })}
          title="Open the full goal page"
        >
          Full view
        </Button>
        <Button
          className="ml-auto"
          variant="ghost"
          icon={<IconTrash size={13} />}
          title="Delete goal"
          onClick={() =>
            ask({
              title: "Delete goal?",
              message: "Linked tasks are kept and unlinked. This cannot be undone.",
              confirmLabel: "Delete",
              danger: true,
              onConfirm: () => {
                deleteGoalHard(goal.id);
                onClose();
              },
            })
          }
        />
      </div>
    </aside>
  );
}

/* ---------------------------------- view ----------------------------------- */

export function GoalsView({ goalId }: { goalId?: string }) {
  const goals = useData((s) => s.goals);
  const projects = useData((s) => s.projects);
  const tasks = useData((s) => s.tasks);
  const milestones = useData((s) => s.milestones);
  const go = useUI((s) => s.go);
  const setGoalModal = useUI((s) => s.setGoalModal);

  const [filter, setFilter] = useState<Filter>("active");
  const [projectFilter, setProjectFilter] = useState<string>("");

  const selected = goalId ? goals.find((g) => g.id === goalId) ?? null : null;

  const shown = useMemo(() => {
    const byFilter = goals.filter((g) => {
      if (filter === "active") return g.status === "active";
      if (filter === "completed") return g.status === "completed";
      return true;
    });
    const byProject = projectFilter
      ? byFilter.filter((g) => g.projectId === projectFilter)
      : byFilter;
    return sortedGoals(byProject);
  }, [goals, filter, projectFilter]);

  const activeCount = goals.filter((g) => g.status === "active").length;
  const avgProgress =
    activeCount > 0
      ? Math.round(
          goals
            .filter((g) => g.status === "active")
            .reduce((a, g) => a + goalProgress(g, tasks, milestones), 0) / activeCount,
        )
      : 0;
  const projs = projects.filter((p) => !p.archivedAt);

  const select = (id: string) =>
    go({ name: "goals", goalId: goalId === id ? undefined : id });

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="min-w-0 flex-1">
        <ViewShell
          title="Goals"
          meta={
            <span>
              {plural(activeCount, "active goal")}
              {activeCount > 0 && <> · {avgProgress}% average progress</>}
            </span>
          }
          actions={
            <>
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "active", label: "Active" },
                  { value: "completed", label: "Completed" },
                  { value: "all", label: "All" },
                ]}
              />
              <Button
                variant="primary"
                icon={<IconPlus size={13} />}
                onClick={() => setGoalModal({ projectId: projs[0]?.id })}
              >
                New goal
              </Button>
            </>
          }
        >
          <div className="mx-auto w-full max-w-[820px]">
            {projs.length > 1 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setProjectFilter("")}
                  className={cn(
                    "h-[26px] rounded-lg border px-2.5 text-[12px] transition-colors",
                    projectFilter === ""
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-bord bg-card text-ink2 hover:border-bord2",
                  )}
                >
                  All projects
                </button>
                {projs.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProjectFilter(projectFilter === p.id ? "" : p.id)}
                    className={cn(
                      "flex h-[26px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors",
                      projectFilter === p.id
                        ? "border-accent/50 bg-accent/10 text-ink"
                        : "border-bord bg-card text-ink2 hover:border-bord2",
                    )}
                  >
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: p.color }} />
                    <span className="max-w-[130px] truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}

            {shown.length === 0 ? (
              <EmptyState
                icon={<IconTarget size={30} />}
                title={filter === "active" ? "No active goals" : "Nothing here yet"}
                hint="A goal is a dated outcome. Give it a deadline and hang tasks off it — progress then takes care of itself."
                action={
                  <Button
                    variant="primary"
                    icon={<IconPlus size={13} />}
                    onClick={() => setGoalModal({ projectId: projs[0]?.id })}
                  >
                    New goal
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-2">
                {shown.map((g) => (
                  <GoalRow
                    key={g.id}
                    goal={g}
                    selected={goalId === g.id}
                    onSelect={() => select(g.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </ViewShell>
      </div>

      {selected && <GoalPanel goal={selected} onClose={() => go({ name: "goals" })} />}
    </div>
  );
}
