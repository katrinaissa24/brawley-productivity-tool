import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { Goal, Task } from "../types";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import {
  activeSprint,
  blockDuration,
  goalProgress,
  goalTasks,
  isOpen,
  sortedGoals,
  todayAgenda,
  workloadMinutes,
} from "../stores/selectors";
import {
  cn,
  daysUntil,
  formatClock,
  formatMinutes,
  formatTimeRange,
  parseHM,
  plural,
  PRIORITY_META,
  relativeDayLabel,
  todayStr,
} from "../lib/util";
import { ViewShell } from "../components/ViewShell";
import { TaskCheck } from "../components/TaskCard";
import { Button, EmptyState, ProgressBar, ProgressRing, SectionLabel } from "../components/ui/primitives";
import {
  IconArrowRight,
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconPlay,
  IconSparkle,
  IconSun,
  IconTarget,
} from "../components/icons";

/** Re-renders the page every half minute so "now" stays honest. */
function useMinuteTick(): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/* --------------------------------- pieces --------------------------------- */

function ProjectDot({ task }: { task: Task }) {
  const project = useData((s) => s.projects.find((p) => p.id === task.projectId));
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink3">
      <span
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: project?.color ?? "rgb(var(--c-text3))" }}
      />
      <span className="truncate">{project?.name ?? "Inbox"}</span>
    </span>
  );
}

/** The one thing to be doing right now — or the next thing, when nothing is. */
function NowCard({ task, timed, nowMin }: { task: Task; timed: boolean; nowMin: number }) {
  const openDetail = useUI((s) => s.openDetail);
  const toast = useUI((s) => s.toast);
  const start = task.doTime != null ? parseHM(task.doTime) : null;
  const dur = blockDuration(task);
  const elapsed = start != null ? Math.min(100, Math.max(0, ((nowMin - start) / dur) * 100)) : null;

  return (
    <div className="anim-fade rounded-xl border border-accent/30 bg-card px-5 py-4 shadow-card">
      <div className="flex items-center gap-2">
        <SectionLabel className="text-accent">{timed ? "Happening now" : "In progress"}</SectionLabel>
        {start != null && (
          <span className="text-[11.5px] tabular-nums text-ink3">
            {formatTimeRange(start, start + dur)}
          </span>
        )}
      </div>
      <button
        onClick={() => openDetail(task.id)}
        className="mt-1.5 block w-full text-left"
      >
        <p className="text-[19px] font-semibold leading-snug tracking-[-0.01em] text-ink">
          {task.title}
        </p>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <ProjectDot task={task} />
        {task.priority && (
          <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", PRIORITY_META[task.priority].chip)}>
            {PRIORITY_META[task.priority].label}
          </span>
        )}
        {task.estimateMinutes != null && task.estimateMinutes > 0 && (
          <span className="flex items-center gap-1 text-[11.5px] text-ink3">
            <IconClock size={11} />
            {formatMinutes(task.estimateMinutes)}
          </span>
        )}
        {task.dueDate && (
          <span
            className={cn(
              "text-[11.5px]",
              task.dueDate < todayStr() ? "font-medium text-red-500" : "text-ink3",
            )}
          >
            due {relativeDayLabel(task.dueDate)}
          </span>
        )}
      </div>
      {elapsed != null && (
        <div className="mt-3">
          <ProgressBar pct={elapsed} />
        </div>
      )}
      <div className="mt-3.5 flex items-center gap-2">
        {task.status !== "in_progress" && (
          <Button
            variant="primary"
            icon={<IconPlay size={12} />}
            onClick={() => {
              const r = useData.getState().trySetStatus(task.id, "in_progress");
              if (!r.ok && r.msg) toast(r.msg, "error");
            }}
          >
            Start
          </Button>
        )}
        <Button
          variant={task.status === "in_progress" ? "primary" : "secondary"}
          icon={<IconCheckCircle size={13} />}
          onClick={() => useData.getState().completeTask(task.id)}
        >
          Complete
        </Button>
        <Button variant="ghost" onClick={() => openDetail(task.id)}>
          Details
        </Button>
      </div>
    </div>
  );
}

/** Compact row used by the "next up" and "anytime today" lists. */
function AgendaRow({ task, showTime }: { task: Task; showTime?: boolean }) {
  const openDetail = useUI((s) => s.openDetail);
  const select = useUI((s) => s.select);
  const start = task.doTime != null ? parseHM(task.doTime) : null;
  const done = task.status === "done";

  return (
    <div
      onClick={() => {
        select(task.id);
        openDetail(task.id);
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-bord hover:bg-card"
    >
      {showTime && (
        <span className="w-[58px] shrink-0 text-right text-[11.5px] font-medium tabular-nums text-ink3">
          {start != null ? formatClock(start) : "—"}
        </span>
      )}
      <TaskCheck
        done={done}
        priority={task.priority}
        onToggle={() =>
          done
            ? useData.getState().updateTask(task.id, { status: "todo" })
            : useData.getState().completeTask(task.id)
        }
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13.5px] text-ink",
            done && "text-ink3 line-through",
          )}
        >
          {task.title}
        </span>
      </span>
      <ProjectDot task={task} />
    </div>
  );
}

function GoalRow({ goal }: { goal: Goal }) {
  const tasks = useData((s) => s.tasks);
  const milestones = useData((s) => s.milestones);
  const projects = useData((s) => s.projects);
  const go = useUI((s) => s.go);

  const pct = goalProgress(goal, tasks, milestones);
  const left = daysUntil(goal.targetDate);
  const linked = goalTasks(tasks, goal.id);
  const project = projects.find((p) => p.id === goal.projectId);

  return (
    <button
      onClick={() => go({ name: "goals", goalId: goal.id })}
      className="group w-full rounded-xl border border-bord bg-card px-3.5 py-3 text-left shadow-card transition-all hover:border-bord2 hover:shadow-cardHover"
    >
      <div className="flex items-center gap-3">
        <ProgressRing pct={pct} size={40} stroke={4.5} color={project?.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-ink">{goal.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink3">
            {project && (
              <>
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: project.color }}
                />
                <span className="max-w-[110px] truncate">{project.name}</span>
                <span className="text-ink3/50">·</span>
              </>
            )}
            <span
              className={cn(
                left < 0
                  ? "font-medium text-red-500"
                  : left <= 2
                    ? "font-medium text-orange-500"
                    : undefined,
              )}
            >
              {left < 0
                ? `${-left}d overdue`
                : left === 0
                  ? "Due today"
                  : `${left}d left`}
            </span>
            <span className="text-ink3/50">·</span>
            <span>
              {linked.filter((t) => t.status === "done").length}/{linked.length} tasks
            </span>
          </p>
        </div>
      </div>
      <div className="mt-2.5">
        <ProgressBar pct={pct} color={project?.color} />
      </div>
    </button>
  );
}

/* ---------------------------------- view ----------------------------------- */

export function HomeView() {
  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const goals = useData((s) => s.goals);
  const sprints = useData((s) => s.sprints);
  const settings = useSettings((s) => s.settings);
  const setViewPref = useSettings((s) => s.setViewPref);
  const go = useUI((s) => s.go);
  const setPlanDayOpen = useUI((s) => s.setPlanDayOpen);
  const setGoalModal = useUI((s) => s.setGoalModal);

  const nowMin = useMinuteTick();
  const agenda = useMemo(
    () => todayAgenda(tasks, projects, nowMin),
    [tasks, projects, nowMin],
  );

  const liveGoals = useMemo(
    () => sortedGoals(goals.filter((g) => g.status === "active")),
    [goals],
  );

  const openToday = useMemo(
    () => [...agenda.timed, ...agenda.anytime],
    [agenda.timed, agenda.anytime],
  );
  const remaining = workloadMinutes(openToday);
  const sprint = activeSprint(sprints);
  const sprintOpen = sprint
    ? tasks.filter((t) => t.sprintId === sprint.id && isOpen(t)).length
    : 0;

  const now = new Date();
  const nextUp = agenda.upcoming.filter((t) => t.id !== agenda.current?.id).slice(0, 5);
  // Whatever's in the hero above is already accounted for — don't count it twice.
  const anytimeRest = agenda.anytime.filter((t) => t.id !== agenda.current?.id);
  const anytime = anytimeRest.slice(0, 6);
  const missed = agenda.missed.slice(0, 4);
  const nothingPlanned = openToday.length === 0 && agenda.done.length === 0;

  const stat = (label: string, value: string) => (
    <div className="rounded-xl border border-bord bg-card px-3.5 py-2.5 shadow-card">
      <p className="text-[17px] font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-[11.5px] text-ink3">{label}</p>
    </div>
  );

  return (
    <ViewShell
      title={greeting(now.getHours())}
      meta={
        <span>
          {format(now, "EEEE, MMM d")}
          {openToday.length > 0 && (
            <>
              {" · "}
              {plural(openToday.length, "task")} left
              {remaining > 0 && <> · ~{formatMinutes(remaining)}</>}
            </>
          )}
        </span>
      }
      actions={
        <>
          <Button
            variant="secondary"
            icon={<IconCalendar size={13} />}
            onClick={() => {
              setViewPref("today.view", "calendar");
              go({ name: "today" });
            }}
          >
            Time-block today
          </Button>
          <Button variant="secondary" icon={<IconSparkle size={13} />} onClick={() => setPlanDayOpen(true)}>
            Plan my day
          </Button>
        </>
      }
    >
      <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------ left column ------------------------------ */}
        <div className="min-w-0">
          {agenda.current ? (
            <NowCard task={agenda.current} timed={agenda.currentTimed} nowMin={nowMin} />
          ) : nextUp.length > 0 ? (
            <NowCard task={nextUp[0]} timed nowMin={nowMin} />
          ) : nothingPlanned ? (
            <EmptyState
              icon={<IconSun size={28} />}
              title="Nothing on the plan yet"
              hint="Pick a few tasks for today — a short list you can actually finish beats a long one you can't."
              action={
                <Button variant="primary" icon={<IconSparkle size={13} />} onClick={() => setPlanDayOpen(true)}>
                  Plan my day
                </Button>
              }
            />
          ) : (
            <div className="anim-fade rounded-xl border border-bord bg-card px-5 py-6 text-center shadow-card">
              <IconCheckCircle size={28} className="mx-auto text-accent" />
              <p className="mt-2.5 text-[15px] font-semibold text-ink">Nothing running right now</p>
              <p className="mt-1 text-[12.5px] text-ink3">
                {agenda.anytime.length > 0
                  ? "Pick something from below, or block it out on the calendar."
                  : `${plural(agenda.done.length, "task")} done today — enjoy the quiet.`}
              </p>
            </div>
          )}

          {(nextUp.length > 1 || (agenda.current && nextUp.length > 0)) && (
            <div className="mt-6">
              <SectionLabel className="mb-1.5">Next up</SectionLabel>
              <div className="flex flex-col">
                {(agenda.current ? nextUp : nextUp.slice(1)).map((t) => (
                  <AgendaRow key={t.id} task={t} showTime />
                ))}
              </div>
            </div>
          )}

          {anytime.length > 0 && (
            <div className="mt-6">
              <SectionLabel className="mb-1.5">Anytime today · {anytimeRest.length}</SectionLabel>
              <div className="flex flex-col">
                {anytime.map((t) => (
                  <AgendaRow key={t.id} task={t} />
                ))}
              </div>
              {anytimeRest.length > anytime.length && (
                <button
                  onClick={() => go({ name: "today" })}
                  className="mt-1 px-2.5 text-[12px] text-accent hover:underline"
                >
                  {anytimeRest.length - anytime.length} more on Today
                </button>
              )}
            </div>
          )}

          {missed.length > 0 && (
            <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
              <SectionLabel className="mb-0.5 text-amber-600 dark:text-amber-400">
                Slipped past its block · {agenda.missed.length}
              </SectionLabel>
              <p className="mb-1.5 text-[11.5px] text-ink3">
                Scheduled earlier today and still open — start one, or drag it to a new slot.
              </p>
              <div className="flex flex-col">
                {missed.map((t) => (
                  <AgendaRow key={t.id} task={t} showTime />
                ))}
              </div>
            </div>
          )}

          {agenda.done.length > 0 && (
            <div className="mt-6">
              <SectionLabel className="mb-1.5">Done today · {agenda.done.length}</SectionLabel>
              <div className="flex flex-col opacity-70">
                {agenda.done.slice(0, 4).map((t) => (
                  <AgendaRow key={t.id} task={t} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------ right column ----------------------------- */}
        <div className="min-w-0">
          <div className="grid grid-cols-3 gap-2">
            {stat("done today", String(agenda.done.length))}
            {stat("left today", String(openToday.length))}
            {stat("in sprint", String(sprintOpen))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <SectionLabel>Goals · {liveGoals.length}</SectionLabel>
            <button
              onClick={() => go({ name: "goals" })}
              className="flex items-center gap-1 text-[12px] text-accent hover:underline"
            >
              All goals
              <IconArrowRight size={12} />
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {liveGoals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-bord2 px-4 py-6 text-center">
                <IconTarget size={22} className="mx-auto text-ink3/70" />
                <p className="mt-2 text-[13px] text-ink2">No active goals</p>
                <p className="mt-1 text-[11.5px] text-ink3">
                  Goals give today's tasks a reason to exist.
                </p>
                <Button
                  className="mt-3"
                  size="xs"
                  variant="secondary"
                  icon={<IconTarget size={12} />}
                  onClick={() => setGoalModal({ projectId: projects.find((p) => !p.archivedAt)?.id })}
                >
                  New goal
                </Button>
              </div>
            ) : (
              liveGoals.slice(0, 6).map((g) => <GoalRow key={g.id} goal={g} />)
            )}
            {liveGoals.length > 6 && (
              <button
                onClick={() => go({ name: "goals" })}
                className="text-[12px] text-accent hover:underline"
              >
                {liveGoals.length - 6} more
              </button>
            )}
          </div>

          {settings.wipLimitEnabled && (
            <p className="mt-4 text-[11.5px] leading-relaxed text-ink3">
              WIP limit is {settings.wipLimit} — finish what's started before pulling more in.
            </p>
          )}
        </div>
      </div>
    </ViewShell>
  );
}
