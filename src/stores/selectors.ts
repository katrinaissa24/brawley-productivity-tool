import { format } from "date-fns";
import type { Goal, Milestone, Project, Sprint, Task, TaskStatus } from "../types";
import { daysBetween, daysUntil, localDateOf, parseDateStr, sum, todayStr } from "../lib/util";

export const isOpen = (t: Task): boolean => !t.archivedAt && t.status !== "done";

export function activeProjects(projects: Project[]): Project[] {
  return projects
    .filter((p) => !p.archivedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Tasks not archived and not belonging to an archived project. */
export function visibleTasks(tasks: Task[], projects: Project[]): Task[] {
  const archivedProjects = new Set(projects.filter((p) => p.archivedAt).map((p) => p.id));
  return tasks.filter(
    (t) => !t.archivedAt && (!t.projectId || !archivedProjects.has(t.projectId)),
  );
}

export function inboxTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.projectId && isOpen(t))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export interface TodayLists {
  focus: Task[];
  later: Task[];
  done: Task[];
}

/** Count of today's tasks that aren't complete — the Today sidebar badge. */
export function todayOpenCount(tasks: Task[], projects: Project[]): number {
  const today = todayStr();
  return visibleTasks(tasks, projects).filter(
    (t) => t.status !== "done" && t.doDate != null && t.doDate <= today,
  ).length;
}

export function todayLists(tasks: Task[], projects: Project[], cap: number): TodayLists {
  const today = todayStr();
  const vis = visibleTasks(tasks, projects);
  const open = vis
    .filter((t) => t.status !== "done" && t.doDate != null && t.doDate <= today)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const done = vis
    .filter((t) => t.status === "done" && t.completedAt && localDateOf(t.completedAt) === today)
    .sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1));
  return { focus: open.slice(0, cap), later: open.slice(cap), done };
}

export function statusColumns(blockedEnabled: boolean): TaskStatus[] {
  return blockedEnabled
    ? ["todo", "in_progress", "blocked", "done"]
    : ["todo", "in_progress", "done"];
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

export function projectTasks(tasks: Task[], projectId: string): Task[] {
  return tasks
    .filter((t) => t.projectId === projectId && !t.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sprintTasks(tasks: Task[], projects: Project[], sprintId: string): Task[] {
  return visibleTasks(tasks, projects)
    .filter((t) => t.sprintId === sprintId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Open tasks with a project, not committed to the given sprint. */
export function backlogTasks(tasks: Task[], projects: Project[], sprintId: string): Task[] {
  return visibleTasks(tasks, projects)
    .filter((t) => isOpen(t) && t.projectId && t.sprintId !== sprintId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function goalTasks(tasks: Task[], goalId: string): Task[] {
  return tasks
    .filter((t) => t.goalId === goalId && !t.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function goalProgress(goal: Goal, tasks: Task[], milestones: Milestone[]): number {
  if (goal.status === "completed") return 100;
  switch (goal.progressMode) {
    case "manual":
      return goal.manualProgress;
    case "milestones": {
      const ms = milestones.filter((m) => m.goalId === goal.id);
      if (ms.length === 0) return 0;
      return Math.round((ms.filter((m) => m.done).length / ms.length) * 100);
    }
    case "auto_tasks": {
      const linked = tasks.filter((t) => t.goalId === goal.id && !t.archivedAt);
      if (linked.length === 0) return 0;
      return Math.round(
        (linked.filter((t) => t.status === "done").length / linked.length) * 100,
      );
    }
  }
}

export function activeGoals(goals: Goal[]): Goal[] {
  return goals
    .filter((g) => g.status === "active")
    .slice()
    .sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1));
}

export function overdueActiveGoals(goals: Goal[]): Goal[] {
  const today = todayStr();
  return activeGoals(goals).filter((g) => g.targetDate < today);
}

export function staleTasks(tasks: Task[], projects: Project[], staleDays: number): Task[] {
  const cutoff = new Date(Date.now() - staleDays * 864e5).toISOString();
  return visibleTasks(tasks, projects)
    .filter((t) => isOpen(t) && t.updatedAt < cutoff)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
}

/**
 * The WIP count: tasks in progress that are visible to the user. Every
 * in-progress task is planned for today (see trySetStatus / ensureActiveSprint),
 * so this is exactly the set shown in the Today bar's "In progress" section —
 * archived tasks and tasks in archived projects never inflate it.
 */
export function countInProgress(tasks: Task[], projects: Project[]): number {
  return visibleTasks(tasks, projects).filter((t) => t.status === "in_progress").length;
}

export function workloadMinutes(list: Task[]): number {
  return sum(list.map((t) => t.estimateMinutes ?? 0));
}

export function activeSprint(sprints: Sprint[]): Sprint | null {
  const actives = sprints.filter((s) => s.status === "active");
  if (actives.length === 0) return null;
  return actives.reduce((a, b) => (a.startDate > b.startDate ? a : b));
}

export function reviewDue(sprint: Sprint | null): boolean {
  if (!sprint) return false;
  return todayStr() > sprint.endDate;
}

export function sprintLabel(sprint: Sprint): string {
  const s = parseDateStr(sprint.startDate);
  const e = parseDateStr(sprint.endDate);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  return sameMonth
    ? `${format(s, "MMM d")}–${format(e, "d")}`
    : `${format(s, "MMM d")} – ${format(e, "MMM d")}`;
}

export function sprintDaysLeft(sprint: Sprint): number {
  return Math.max(0, daysUntil(sprint.endDate) + 1);
}

/** Tasks completed in [from, to] local-date range (inclusive). */
export function doneInRange(tasks: Task[], from: string, to: string): Task[] {
  return tasks.filter((t) => {
    if (t.status !== "done" || !t.completedAt) return false;
    const d = localDateOf(t.completedAt);
    return d >= from && d <= to;
  });
}

export function trendByDay(tasks: Task[], from: string, to: string): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of doneInRange(tasks, from, to)) {
    const d = localDateOf(t.completedAt!);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const out: { date: string; count: number }[] = [];
  const days = Math.max(0, daysBetween(from, to));
  for (let i = 0; i <= days; i++) {
    const d = new Date(parseDateStr(from));
    d.setDate(d.getDate() + i);
    const key = format(d, "yyyy-MM-dd");
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

export interface PlanCandidate {
  task: Task;
  reason: "overdue" | "due_soon" | "sprint_p1" | "sprint" | "priority";
  rank: number;
}

/** Ranked candidates for "Plan my day": overdue first, then P1→P3, then oldest. */
export function planCandidates(tasks: Task[], projects: Project[], sprintId: string | null): PlanCandidate[] {
  const today = todayStr();
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const out: PlanCandidate[] = [];
  for (const t of visibleTasks(tasks, projects)) {
    if (!isOpen(t)) continue;
    if (t.doDate && t.doDate <= today) continue; // already planned for today
    let reason: PlanCandidate["reason"] | null = null;
    if (t.dueDate && t.dueDate < today) reason = "overdue";
    else if (t.dueDate && t.dueDate <= soon) reason = "due_soon";
    else if (sprintId && t.sprintId === sprintId && t.priority === "P1") reason = "sprint_p1";
    else if (sprintId && t.sprintId === sprintId) reason = "sprint";
    else if (t.priority === "P1" || t.priority === "P2") reason = "priority";
    if (!reason) continue;
    const reasonRank = { overdue: 0, due_soon: 1, sprint_p1: 2, sprint: 3, priority: 4 }[reason];
    const prioRank = t.priority === "P1" ? 0 : t.priority === "P2" ? 1 : t.priority === "P3" ? 2 : 3;
    out.push({ task: t, reason, rank: reasonRank * 100 + prioRank * 10 });
  }
  return out.sort(
    (a, b) => a.rank - b.rank || (a.task.createdAt < b.task.createdAt ? -1 : 1),
  );
}

export function subtaskProgress(subtasks: { done: boolean }[]): { done: number; total: number } {
  return { done: subtasks.filter((s) => s.done).length, total: subtasks.length };
}

export function ageInDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
}
