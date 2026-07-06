import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { marked } from "marked";
import type { Milestone } from "../types";
import { useData } from "../stores/data";
import { useSettings, isDark } from "../stores/settings";
import { useUI } from "../stores/ui";
import { goalProgress, goalTasks, isOpen } from "../stores/selectors";
import { addDaysStr, cn, daysUntil, formatDateShort, formatMinutes, localDateOf, plural, todayStr } from "../lib/util";
import { TaskCard } from "../components/TaskCard";
import { ViewShell } from "../components/ViewShell";
import { Button, EmptyState, ProgressRing, SectionLabel } from "../components/ui/primitives";
import {
  IconCheck,
  IconCheckCircle,
  IconChevronLeft,
  IconPencil,
  IconPlus,
  IconTarget,
  IconTrash,
  IconX,
} from "../components/icons";

function MilestoneRow({ m }: { m: Milestone }) {
  const updateMilestone = useData((s) => s.updateMilestone);
  const deleteMilestone = useData((s) => s.deleteMilestone);
  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-2 py-[7px] hover:bg-panel/70">
      <button
        onClick={() => updateMilestone(m.id, { done: !m.done })}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
          m.done ? "border-accent bg-accent text-white" : "border-bord2 hover:border-accent",
        )}
      >
        {m.done && <IconCheck size={10} strokeWidth={3} />}
      </button>
      <span className={cn("flex-1 text-[13.5px]", m.done ? "text-ink3 line-through" : "text-ink")}>
        {m.title}
      </span>
      <button
        onClick={() => deleteMilestone(m.id)}
        className="p-0.5 text-ink3 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
      >
        <IconX size={12} />
      </button>
    </div>
  );
}

export function GoalView({ goalId }: { goalId: string }) {
  const goals = useData((s) => s.goals);
  const projects = useData((s) => s.projects);
  const tasks = useData((s) => s.tasks);
  const milestones = useData((s) => s.milestones);
  const addTask = useData((s) => s.addTask);
  const addMilestone = useData((s) => s.addMilestone);
  const updateGoal = useData((s) => s.updateGoal);
  const setGoalStatus = useData((s) => s.setGoalStatus);
  const deleteGoalHard = useData((s) => s.deleteGoalHard);
  const settings = useSettings((s) => s.settings);
  const go = useUI((s) => s.go);
  const ask = useUI((s) => s.ask);
  const setGoalModal = useUI((s) => s.setGoalModal);
  const openDetail = useUI((s) => s.openDetail);

  const [newTask, setNewTask] = useState("");
  const [newMilestone, setNewMilestone] = useState("");

  const goal = goals.find((g) => g.id === goalId);
  const linked = useMemo(() => goalTasks(tasks, goalId), [tasks, goalId]);
  const goalMilestones = useMemo(
    () => milestones.filter((m) => m.goalId === goalId).sort((a, b) => a.sortOrder - b.sortOrder),
    [milestones, goalId],
  );

  const burnup = useMemo(() => {
    if (!goal) return [];
    const doneTasks = linked
      .filter((t) => t.completedAt)
      .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? -1 : 1));
    let start = localDateOf(goal.createdAt);
    for (const t of doneTasks) {
      const d = localDateOf(t.completedAt!);
      if (d < start) start = d;
    }
    const end = todayStr();
    const out: { date: string; done: number }[] = [];
    let cursor = start;
    let count = 0;
    let i = 0;
    let guard = 0;
    while (cursor <= end && guard++ < 120) {
      while (i < doneTasks.length && localDateOf(doneTasks[i].completedAt!) <= cursor) {
        count++;
        i++;
      }
      out.push({ date: cursor.slice(5), done: count });
      cursor = addDaysStr(cursor, 1);
    }
    return out;
  }, [goal, linked]);

  if (!goal) {
    return (
      <ViewShell title="Goal">
        <EmptyState icon={<IconTarget size={28} />} title="Goal not found" hint="It may have been deleted." />
      </ViewShell>
    );
  }

  const project = projects.find((p) => p.id === goal.projectId);
  const pct = goalProgress(goal, tasks, milestones);
  const left = daysUntil(goal.targetDate);
  const openTasks = linked.filter(isOpen);
  const doneTasks = linked.filter((t) => t.status === "done");
  const dark = isDark(settings);
  const overdue = goal.status === "active" && left < 0;

  const statusChip =
    goal.status === "completed" ? (
      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
        Completed
      </span>
    ) : goal.status === "missed" ? (
      <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[12px] font-medium text-red-600 dark:text-red-400">
        Missed
      </span>
    ) : goal.status === "archived" ? (
      <span className="rounded-md bg-zinc-500/15 px-2 py-0.5 text-[12px] font-medium text-ink3">Archived</span>
    ) : null;

  return (
    <ViewShell
      title={
        <span className="flex items-center gap-2.5">
          <button
            onClick={() => project && go({ name: "project", projectId: project.id })}
            className="rounded-md p-1 text-ink3 hover:bg-ink/5 hover:text-ink"
            title={`Back to ${project?.name ?? "project"}`}
          >
            <IconChevronLeft size={16} />
          </button>
          <span className="truncate">{goal.title}</span>
          {statusChip}
        </span>
      }
      meta={
        <span className="flex items-center gap-1.5">
          {project && (
            <>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: project.color }} />
              {project.name} ·
            </>
          )}
          Target {formatDateShort(goal.targetDate)}
        </span>
      }
      actions={
        <>
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
          <Button variant="secondary" icon={<IconPencil size={13} />} onClick={() => setGoalModal({ goalId: goal.id })}>
            Edit
          </Button>
          <Button
            variant="ghost"
            icon={<IconTrash size={13} />}
            onClick={() =>
              ask({
                title: "Delete goal?",
                message: "Linked tasks are kept and unlinked. This cannot be undone.",
                confirmLabel: "Delete",
                danger: true,
                onConfirm: () => {
                  const pid = goal.projectId;
                  deleteGoalHard(goal.id);
                  go(pid ? { name: "project", projectId: pid } : { name: "today" });
                },
              })
            }
          />
        </>
      }
    >
      <div className="max-w-[760px]">
        {overdue && (
          <div className="anim-fade mb-4 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5">
            <span className="text-[13px] text-ink">
              Target date passed at {pct}% — extend it, or close the goal out.
            </span>
            <div className="flex gap-1.5">
              <Button size="xs" variant="secondary" onClick={() => setGoalModal({ goalId: goal.id })}>
                Extend
              </Button>
              <Button size="xs" variant="secondary" onClick={() => setGoalStatus(goal.id, "missed")}>
                Mark missed
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setGoalStatus(goal.id, "archived")}>
                Archive
              </Button>
            </div>
          </div>
        )}

        {/* hero */}
        <div className="flex items-center gap-6 rounded-xl border border-bord bg-card px-6 py-5 shadow-card">
          <ProgressRing pct={pct} size={84} stroke={8} />
          <div className="flex-1">
            <p
              className={cn(
                "text-[15px] font-semibold",
                left <= 2 && goal.status === "active"
                  ? "text-red-500"
                  : left <= 7 && goal.status === "active"
                    ? "text-orange-500"
                    : "text-ink",
              )}
            >
              {goal.status !== "active"
                ? formatDateShort(goal.targetDate)
                : left < 0
                  ? `${-left} ${-left === 1 ? "day" : "days"} overdue`
                  : left === 0
                    ? "Due today"
                    : `${left} ${left === 1 ? "day" : "days"} remaining`}
            </p>
            <p className="mt-1 text-[13px] text-ink2">
              {doneTasks.length}/{linked.length} linked tasks done
              {openTasks.length > 0 && (
                <> · ~{formatMinutes(openTasks.reduce((a, t) => a + (t.estimateMinutes ?? 0), 0))} left</>
              )}
            </p>
            {goal.progressMode === "manual" && goal.status === "active" && (
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={goal.manualProgress}
                  onChange={(e) => updateGoal(goal.id, { manualProgress: Number(e.target.value) })}
                  className="w-[220px] accent-[rgb(var(--c-accent))]"
                />
                <span className="text-[12.5px] font-medium tabular-nums text-ink2">
                  {goal.manualProgress}%
                </span>
              </div>
            )}
          </div>
          {burnup.length > 1 && doneTasks.length > 0 && (
            <div className="h-[76px] w-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={burnup} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="burnup" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={settings.accentColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={settings.accentColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={[0, "dataMax"]} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      background: dark ? "#2f2f35" : "#fff",
                      border: `1px solid ${dark ? "#3f3f46" : "#e4e4e7"}`,
                      borderRadius: 8,
                      fontSize: 12,
                      padding: "4px 8px",
                    }}
                    formatter={(v) => [`${v} done`, ""]}
                  />
                  <Area
                    type="monotone"
                    dataKey="done"
                    stroke={settings.accentColor}
                    strokeWidth={2}
                    fill="url(#burnup)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="mt-0.5 text-center text-[10.5px] text-ink3">Burn-up · tasks done</p>
            </div>
          )}
        </div>

        {goal.description && (
          <div
            className="md-body mt-4 rounded-xl border border-bord bg-card px-4 py-3 shadow-card"
            dangerouslySetInnerHTML={{ __html: marked.parse(goal.description) as string }}
          />
        )}

        {/* milestones */}
        {(goal.progressMode === "milestones" || goalMilestones.length > 0) && (
          <div className="mt-6">
            <SectionLabel className="mb-2">
              Milestones · {goalMilestones.filter((m) => m.done).length}/{goalMilestones.length}
            </SectionLabel>
            <div className="rounded-xl border border-bord bg-card px-2 py-1.5 shadow-card">
              {goalMilestones.map((m) => (
                <MilestoneRow key={m.id} m={m} />
              ))}
              <div className="flex items-center gap-2.5 px-2 py-1.5">
                <IconPlus size={13} className="shrink-0 text-ink3" />
                <input
                  value={newMilestone}
                  onChange={(e) => setNewMilestone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newMilestone.trim()) {
                      addMilestone(goal.id, newMilestone);
                      setNewMilestone("");
                    }
                  }}
                  placeholder="Add milestone"
                  className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink3"
                />
              </div>
            </div>
          </div>
        )}

        {/* linked tasks */}
        <div className="mt-6">
          <SectionLabel className="mb-2">Tasks · {plural(linked.length, "linked task")}</SectionLabel>
          <div className="flex flex-col gap-2">
            {linked.length === 0 && (
              <div className="rounded-xl border border-dashed border-bord2 px-4 py-6 text-center">
                <p className="text-[13.5px] text-ink2">No tasks yet — a goal without steps stays a wish.</p>
                <p className="mt-1 text-[12px] text-ink3">Add the first one below.</p>
              </div>
            )}
            {openTasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTask.trim()) {
                  const t = addTask({
                    title: newTask,
                    projectId: goal.projectId,
                    goalId: goal.id,
                    priority: settings.defaultPriority,
                  });
                  setNewTask("");
                  if (e.metaKey) openDetail(t.id);
                }
              }}
              placeholder="+ Add task to this goal"
              className="rounded-lg border border-transparent px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink3 hover:border-bord focus:border-accent/50 focus:bg-card"
            />
            {doneTasks.length > 0 && (
              <>
                <SectionLabel className="mt-3 mb-0.5">Done · {doneTasks.length}</SectionLabel>
                {doneTasks.map((t) => (
                  <TaskCard key={t.id} task={t} dense />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </ViewShell>
  );
}
