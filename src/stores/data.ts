import { create } from "zustand";
import * as repo from "../db/repo";
import type {
  Goal,
  GoalStatus,
  Milestone,
  Project,
  Review,
  ReviewSnapshot,
  Sprint,
  Subtask,
  Task,
  TaskStatus,
} from "../types";
import {
  addDaysStr,
  daysBetween,
  nextSortOrder,
  nowISO,
  todayStr,
  toDateStr,
  uuid,
} from "../lib/util";
import { nextOccurrence, parseRecurrence } from "../lib/recurrence";
import { useSettings } from "./settings";
import { useUI } from "./ui";

export interface RolloverDecision {
  [taskId: string]: "rollover" | "backlog" | "archive";
}

interface DataState {
  loaded: boolean;
  projects: Project[];
  goals: Goal[];
  milestones: Milestone[];
  tasks: Task[];
  subtasks: Subtask[];
  sprints: Sprint[];
  reviews: Review[];

  loadAll(): Promise<string | null>;
  refresh(): Promise<void>;

  // Projects
  addProject(input: { name: string; color: string; icon?: string | null }): Project;
  updateProject(id: string, patch: Partial<Project>): void;
  archiveProject(id: string): void;
  restoreProject(id: string): void;
  deleteProjectHard(id: string): void;

  // Tasks
  addTask(input: Partial<Task> & { title: string }): Task;
  updateTask(id: string, patch: Partial<Task>): void;
  trySetStatus(id: string, status: TaskStatus): { ok: boolean; msg?: string };
  completeTask(id: string): void;
  archiveTask(id: string): void;
  restoreTask(id: string): void;
  deleteTaskHard(id: string): void;
  applySortOrders(pairs: { id: string; sortOrder: number }[], kind: "task" | "project"): void;
  /**
   * Reorder/insert a task relative to `overId` within an ordered list of visible ids.
   * Works for same-list moves (arrayMove semantics) and cross-list inserts.
   */
  reorderTaskInList(listIds: string[], activeId: string, overId: string): void;

  // Subtasks
  addSubtask(taskId: string, title: string): void;
  updateSubtask(id: string, patch: Partial<Subtask>): void;
  deleteSubtask(id: string): void;

  // Goals
  addGoal(input: {
    projectId: string;
    title: string;
    description?: string | null;
    targetDate: string;
    progressMode?: Goal["progressMode"];
    deadlineBehavior?: Goal["deadlineBehavior"];
  }): Goal;
  updateGoal(id: string, patch: Partial<Goal>): void;
  setGoalStatus(id: string, status: GoalStatus): void;
  deleteGoalHard(id: string): void;
  addMilestone(goalId: string, title: string): void;
  updateMilestone(id: string, patch: Partial<Milestone>): void;
  deleteMilestone(id: string): void;

  // Sprints
  ensureActiveSprint(): void;
  commitToSprint(taskId: string, sprintId: string): void;
  removeFromSprint(taskId: string): void;
  finishReview(args: {
    sprintId: string;
    decisions: RolloverDecision;
    pickedTaskIds: string[];
    reflections: string | null;
    snapshot: ReviewSnapshot;
  }): void;
  deleteReview(id: string): void;

  /** Split a task's title into N parts; part 1 keeps the original task. */
  splitTask(id: string, titles: string[]): void;

  insertDemoData(): void;
}

/** Fire-and-forget DB write; on failure reload from disk so UI never lies. */
function persist(op: () => Promise<unknown>) {
  op().catch((e) => {
    console.error("DB write failed", e);
    useUI.getState().toast("Couldn't save — reloaded from disk", "error");
    void useData.getState().refresh();
  });
}

export const useData = create<DataState>((set, get) => ({
  loaded: false,
  projects: [],
  goals: [],
  milestones: [],
  tasks: [],
  subtasks: [],
  sprints: [],
  reviews: [],

  async loadAll() {
    const data = await repo.fetchAll();
    set({
      loaded: true,
      projects: data.projects,
      goals: data.goals,
      milestones: data.milestones,
      tasks: data.tasks,
      subtasks: data.subtasks,
      sprints: data.sprints,
      reviews: data.reviews,
    });
    return data.settingsJson;
  },

  async refresh() {
    await get().loadAll();
  },

  addProject(input) {
    const now = nowISO();
    const p: Project = {
      id: uuid(),
      name: input.name.trim(),
      color: input.color,
      icon: input.icon ?? null,
      sortOrder: nextSortOrder(get().projects),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ projects: [...s.projects, p] }));
    persist(() => repo.upsertProject(p));
    return p;
  },

  updateProject(id, patch) {
    const cur = get().projects.find((p) => p.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: nowISO() };
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? next : p)) }));
    persist(() => repo.upsertProject(next));
  },

  archiveProject(id) {
    get().updateProject(id, { archivedAt: nowISO() });
  },

  restoreProject(id) {
    get().updateProject(id, { archivedAt: null });
  },

  deleteProjectHard(id) {
    const goalIds = get().goals.filter((g) => g.projectId === id).map((g) => g.id);
    const taskIds = get().tasks.filter((t) => t.projectId === id).map((t) => t.id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      goals: s.goals.filter((g) => g.projectId !== id),
      milestones: s.milestones.filter((m) => !goalIds.includes(m.goalId)),
      tasks: s.tasks.filter((t) => t.projectId !== id),
      subtasks: s.subtasks.filter((st) => !taskIds.includes(st.taskId)),
    }));
    persist(async () => {
      for (const tid of taskIds) await repo.deleteWhere("subtasks", "task_id", tid);
      for (const gid of goalIds) await repo.deleteWhere("milestones", "goal_id", gid);
      await repo.deleteWhere("tasks", "project_id", id);
      await repo.deleteWhere("goals", "project_id", id);
      await repo.deleteRow("projects", id);
    });
  },

  addTask(input) {
    const now = nowISO();
    const t: Task = {
      id: uuid(),
      projectId: input.projectId ?? null,
      goalId: input.goalId ?? null,
      sprintId: input.sprintId ?? null,
      title: input.title.trim(),
      notes: input.notes ?? null,
      status: input.status ?? "todo",
      priority: input.priority ?? null,
      dueDate: input.dueDate ?? null,
      doDate: input.doDate ?? null,
      estimateMinutes: input.estimateMinutes ?? null,
      recurrence: input.recurrence ?? null,
      sortOrder: input.sortOrder ?? nextSortOrder(get().tasks),
      completedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ tasks: [...s.tasks, t] }));
    persist(() => repo.upsertTask(t));
    return t;
  },

  updateTask(id, patch) {
    const cur = get().tasks.find((t) => t.id === id);
    if (!cur) return;
    const next: Task = { ...cur, ...patch, updatedAt: nowISO() };
    if (patch.status && patch.status === "done" && cur.status !== "done") {
      next.completedAt = nowISO();
    }
    if (patch.status && patch.status !== "done" && cur.status === "done") {
      next.completedAt = null;
    }
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    persist(() => repo.upsertTask(next));
  },

  trySetStatus(id, status) {
    const cur = get().tasks.find((t) => t.id === id);
    if (!cur) return { ok: false };
    if (cur.status === status) return { ok: true };
    const st = useSettings.getState().settings;
    if (status === "in_progress" && st.wipLimitEnabled) {
      const count = get().tasks.filter(
        (t) => t.status === "in_progress" && !t.archivedAt && t.id !== id,
      ).length;
      if (count >= st.wipLimit) {
        return {
          ok: false,
          msg: `You already have ${count} task${count === 1 ? "" : "s"} in progress — finish or pause one first.`,
        };
      }
    }
    if (status === "done") {
      get().completeTask(id);
      return { ok: true };
    }
    // Invariant: an in-progress task always belongs to the active sprint.
    if (status === "in_progress") {
      const active = get().sprints.find((sp) => sp.status === "active");
      get().updateTask(id, {
        status,
        ...(active && cur.sprintId !== active.id ? { sprintId: active.id } : {}),
      });
      return { ok: true };
    }
    get().updateTask(id, { status });
    return { ok: true };
  },

  completeTask(id) {
    const t = get().tasks.find((x) => x.id === id);
    if (!t || t.status === "done") return;
    const now = nowISO();
    const done: Task = { ...t, status: "done", completedAt: now, updatedAt: now };
    const writes: Task[] = [done];
    const newSubtasks: Subtask[] = [];

    const rule = parseRecurrence(t.recurrence);
    if (rule) {
      const today = todayStr();
      const anchor = t.doDate ?? t.dueDate ?? today;
      const base = anchor > today ? anchor : today;
      const nextDo = nextOccurrence(rule, base);
      let dueDate: string | null = null;
      let doDate: string | null = null;
      if (t.doDate) doDate = nextDo;
      if (t.dueDate) {
        dueDate =
          t.doDate != null
            ? addDaysStr(nextDo, Math.max(0, daysBetween(t.doDate, t.dueDate)))
            : nextDo;
      }
      if (!t.doDate && !t.dueDate) doDate = nextDo;
      const spawn: Task = {
        ...t,
        id: uuid(),
        status: "todo",
        sprintId: null,
        doDate,
        dueDate,
        completedAt: null,
        archivedAt: null,
        sortOrder: nextSortOrder(get().tasks),
        createdAt: now,
        updatedAt: now,
      };
      writes.push(spawn);
      for (const sub of get().subtasks.filter((x) => x.taskId === t.id)) {
        newSubtasks.push({
          ...sub,
          id: uuid(),
          taskId: spawn.id,
          done: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    set((s) => ({
      tasks: [...s.tasks.map((x) => (x.id === id ? done : x)), ...writes.slice(1)],
      subtasks: [...s.subtasks, ...newSubtasks],
    }));
    persist(() =>
      Promise.all([
        ...writes.map((w) => repo.upsertTask(w)),
        ...newSubtasks.map((sub) => repo.upsertSubtask(sub)),
      ]),
    );
  },

  archiveTask(id) {
    get().updateTask(id, { archivedAt: nowISO() });
  },

  restoreTask(id) {
    get().updateTask(id, { archivedAt: null });
  },

  deleteTaskHard(id) {
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      subtasks: s.subtasks.filter((st) => st.taskId !== id),
    }));
    persist(async () => {
      await repo.deleteWhere("subtasks", "task_id", id);
      await repo.deleteRow("tasks", id);
    });
  },

  applySortOrders(pairs, kind) {
    const now = nowISO();
    const byId = new Map(pairs.map((p) => [p.id, p.sortOrder]));
    if (kind === "task") {
      const changed: Task[] = [];
      set((s) => ({
        tasks: s.tasks.map((t) => {
          const so = byId.get(t.id);
          if (so === undefined || so === t.sortOrder) return t;
          const next = { ...t, sortOrder: so, updatedAt: now };
          changed.push(next);
          return next;
        }),
      }));
      if (changed.length) persist(() => Promise.all(changed.map((t) => repo.upsertTask(t))));
    } else {
      const changed: Project[] = [];
      set((s) => ({
        projects: s.projects.map((p) => {
          const so = byId.get(p.id);
          if (so === undefined || so === p.sortOrder) return p;
          const next = { ...p, sortOrder: so, updatedAt: now };
          changed.push(next);
          return next;
        }),
      }));
      if (changed.length)
        persist(() => Promise.all(changed.map((p) => repo.upsertProject(p))));
    }
  },

  reorderTaskInList(listIds, activeId, overId) {
    if (activeId === overId) return;
    const byId = new Map(get().tasks.map((t) => [t.id, t]));
    if (!byId.has(activeId) || !byId.has(overId)) return;

    const compute = (): number | null => {
      const ids = listIds.filter((id) => id !== activeId);
      const overIdx = ids.indexOf(overId);
      if (overIdx < 0) return null;
      // If moving down within the same list, land after the over item; otherwise before.
      const origFrom = listIds.indexOf(activeId);
      const origOver = listIds.indexOf(overId);
      const insertAt = origFrom >= 0 && origFrom < origOver ? overIdx + 1 : overIdx;
      const prev = insertAt > 0 ? byId.get(ids[insertAt - 1]) : undefined;
      const next = insertAt < ids.length ? byId.get(ids[insertAt]) : undefined;
      if (prev && next) {
        const mid = Math.floor((prev.sortOrder + next.sortOrder) / 2);
        if (mid === prev.sortOrder || mid === next.sortOrder) return null; // gap exhausted
        return mid;
      }
      if (prev) return prev.sortOrder + 1000;
      if (next) return next.sortOrder - 1000;
      return null;
    };

    let so = compute();
    if (so === null) {
      // Renumber the whole task space preserving current global order, then retry.
      const all = [...get().tasks].sort((a, b) => a.sortOrder - b.sortOrder);
      get().applySortOrders(
        all.map((t, i) => ({ id: t.id, sortOrder: (i + 1) * 1000 })),
        "task",
      );
      const fresh = new Map(get().tasks.map((t) => [t.id, t]));
      byId.clear();
      for (const [k, v] of fresh) byId.set(k, v);
      so = compute();
      if (so === null) return;
    }
    get().applySortOrders([{ id: activeId, sortOrder: so }], "task");
  },

  addSubtask(taskId, title) {
    const now = nowISO();
    const st: Subtask = {
      id: uuid(),
      taskId,
      title: title.trim(),
      done: false,
      sortOrder: nextSortOrder(get().subtasks.filter((x) => x.taskId === taskId)),
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ subtasks: [...s.subtasks, st] }));
    persist(() => repo.upsertSubtask(st));
  },

  updateSubtask(id, patch) {
    const cur = get().subtasks.find((x) => x.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: nowISO() };
    set((s) => ({ subtasks: s.subtasks.map((x) => (x.id === id ? next : x)) }));
    persist(() => repo.upsertSubtask(next));
  },

  deleteSubtask(id) {
    set((s) => ({ subtasks: s.subtasks.filter((x) => x.id !== id) }));
    persist(() => repo.deleteRow("subtasks", id));
  },

  addGoal(input) {
    const st = useSettings.getState().settings;
    const now = nowISO();
    const g: Goal = {
      id: uuid(),
      projectId: input.projectId,
      title: input.title.trim(),
      description: input.description ?? null,
      targetDate: input.targetDate,
      progressMode: input.progressMode ?? st.goalDefaultProgressMode,
      manualProgress: 0,
      status: "active",
      deadlineBehavior: input.deadlineBehavior ?? st.goalDeadlineBehavior,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ goals: [...s.goals, g] }));
    persist(() => repo.upsertGoal(g));
    return g;
  },

  updateGoal(id, patch) {
    const cur = get().goals.find((g) => g.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: nowISO() };
    set((s) => ({ goals: s.goals.map((g) => (g.id === id ? next : g)) }));
    persist(() => repo.upsertGoal(next));
  },

  setGoalStatus(id, status) {
    get().updateGoal(id, { status });
  },

  deleteGoalHard(id) {
    const linked = get().tasks.filter((t) => t.goalId === id);
    const now = nowISO();
    const unlinked = linked.map((t) => ({ ...t, goalId: null, updatedAt: now }));
    set((s) => ({
      goals: s.goals.filter((g) => g.id !== id),
      milestones: s.milestones.filter((m) => m.goalId !== id),
      tasks: s.tasks.map((t) => (t.goalId === id ? { ...t, goalId: null, updatedAt: now } : t)),
    }));
    persist(async () => {
      await repo.deleteWhere("milestones", "goal_id", id);
      for (const t of unlinked) await repo.upsertTask(t);
      await repo.deleteRow("goals", id);
    });
  },

  addMilestone(goalId, title) {
    const now = nowISO();
    const m: Milestone = {
      id: uuid(),
      goalId,
      title: title.trim(),
      done: false,
      sortOrder: nextSortOrder(get().milestones.filter((x) => x.goalId === goalId)),
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ milestones: [...s.milestones, m] }));
    persist(() => repo.upsertMilestone(m));
  },

  updateMilestone(id, patch) {
    const cur = get().milestones.find((x) => x.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: nowISO() };
    set((s) => ({ milestones: s.milestones.map((x) => (x.id === id ? next : x)) }));
    persist(() => repo.upsertMilestone(next));
  },

  deleteMilestone(id) {
    set((s) => ({ milestones: s.milestones.filter((x) => x.id !== id) }));
    persist(() => repo.deleteRow("milestones", id));
  },

  ensureActiveSprint() {
    let active = get().sprints.find((sp) => sp.status === "active");
    if (!active) {
      const st = useSettings.getState().settings;
      const today = new Date();
      const diff = (today.getDay() - st.sprintStartDow + 7) % 7;
      const start = new Date(today);
      start.setDate(start.getDate() - diff);
      const startStr = toDateStr(start);
      const endStr = addDaysStr(startStr, Math.max(1, st.sprintLengthDays) - 1);
      const now = nowISO();
      const sp: Sprint = {
        id: uuid(),
        startDate: startStr,
        endDate: endStr,
        status: "active",
        reviewCompletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({ sprints: [...s.sprints, sp] }));
      persist(() => repo.upsertSprint(sp));
      active = sp;
    }
    // Reconcile the invariant for existing data: every open in-progress task
    // belongs to the active sprint (fixes phantom WIP counts).
    const sprintId = active.id;
    const strays = get().tasks.filter(
      (t) => t.status === "in_progress" && !t.archivedAt && t.sprintId !== sprintId,
    );
    if (strays.length) {
      const now = nowISO();
      const updated = strays.map((t) => ({ ...t, sprintId, updatedAt: now }));
      const byId = new Map(updated.map((t) => [t.id, t]));
      set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
      persist(() => Promise.all(updated.map((t) => repo.upsertTask(t))));
    }
  },

  commitToSprint(taskId, sprintId) {
    get().updateTask(taskId, { sprintId });
  },

  removeFromSprint(taskId) {
    const t = get().tasks.find((x) => x.id === taskId);
    // Leaving the sprint also leaves "in progress" — WIP lives inside sprints.
    get().updateTask(taskId, {
      sprintId: null,
      ...(t?.status === "in_progress" ? { status: "todo" as const } : {}),
    });
  },

  finishReview(args) {
    const old = get().sprints.find((sp) => sp.id === args.sprintId);
    if (!old) return;
    const st = useSettings.getState().settings;
    const now = nowISO();
    const today = todayStr();

    // Early review truncates the sprint to today; late review starts the next
    // sprint today instead of back-dating it.
    const closedEnd = old.endDate < today ? old.endDate : today;
    const candidate = addDaysStr(closedEnd, 1);
    const startStr = candidate < today ? today : candidate;
    const endStr = addDaysStr(startStr, Math.max(1, st.sprintLengthDays) - 1);
    const next: Sprint = {
      id: uuid(),
      startDate: startStr,
      endDate: endStr,
      status: "active",
      reviewCompletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const closed: Sprint = {
      ...old,
      endDate: closedEnd,
      status: "completed",
      reviewCompletedAt: now,
      updatedAt: now,
    };

    const taskWrites = new Map<string, Task>();
    for (const t of get().tasks) {
      if (t.sprintId !== old.id || t.archivedAt) continue;
      if (t.status === "done") continue;
      const d = args.decisions[t.id] ?? "rollover";
      if (d === "rollover") taskWrites.set(t.id, { ...t, sprintId: next.id, updatedAt: now });
      else if (d === "backlog")
        taskWrites.set(t.id, {
          ...t,
          sprintId: null,
          doDate: null,
          status: t.status === "in_progress" ? "todo" : t.status,
          updatedAt: now,
        });
      else taskWrites.set(t.id, { ...t, sprintId: null, archivedAt: now, updatedAt: now });
    }
    for (const id of args.pickedTaskIds) {
      if (taskWrites.has(id)) continue;
      const t = get().tasks.find((x) => x.id === id);
      if (t) taskWrites.set(id, { ...t, sprintId: next.id, updatedAt: now });
    }

    const review: Review = {
      id: uuid(),
      sprintId: old.id,
      reflections: args.reflections,
      goalsSnapshot: JSON.stringify(args.snapshot),
      createdAt: now,
    };

    set((s) => ({
      sprints: [...s.sprints.map((sp) => (sp.id === old.id ? closed : sp)), next],
      tasks: s.tasks.map((t) => taskWrites.get(t.id) ?? t),
      reviews: [review, ...s.reviews],
    }));
    persist(() =>
      Promise.all([
        repo.upsertSprint(closed),
        repo.upsertSprint(next),
        ...[...taskWrites.values()].map((t) => repo.upsertTask(t)),
        repo.insertReview(review),
      ]),
    );
  },

  deleteReview(id) {
    set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) }));
    persist(() => repo.deleteRow("reviews", id));
  },

  splitTask(id, titles) {
    const t = get().tasks.find((x) => x.id === id);
    const parts = titles.map((x) => x.trim()).filter(Boolean);
    if (!t || parts.length < 2) return;
    const now = nowISO();
    const perEstimate =
      t.estimateMinutes != null && t.estimateMinutes > 0
        ? Math.max(1, Math.round(t.estimateMinutes / parts.length))
        : null;
    const first: Task = {
      ...t,
      title: parts[0],
      estimateMinutes: perEstimate ?? t.estimateMinutes,
      updatedAt: now,
    };
    const rest: Task[] = parts.slice(1).map((title, k) => ({
      ...t,
      id: uuid(),
      title,
      notes: null,
      recurrence: null,
      // Splitting one in-progress task must not multiply WIP.
      status: t.status === "in_progress" ? "todo" : t.status,
      estimateMinutes: perEstimate,
      sortOrder: t.sortOrder + k + 1,
      completedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }));
    set((s) => ({
      tasks: [...s.tasks.map((x) => (x.id === id ? first : x)), ...rest],
    }));
    persist(() => Promise.all([first, ...rest].map((x) => repo.upsertTask(x))));
    useUI.getState().toast(`Split into ${parts.length} tasks`, "success");
  },

  insertDemoData() {
    const now = nowISO();
    const today = todayStr();
    const mk = (o: Partial<Project> & { name: string; color: string }, i: number): Project => ({
      id: uuid(),
      name: o.name,
      color: o.color,
      icon: o.icon ?? null,
      sortOrder: nextSortOrder(get().projects) + i * 1000,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const pWork = mk({ name: "Startup", color: "#6366F1" }, 0);
    const pLearn = mk({ name: "Learning", color: "#14B8A6" }, 1);
    const pLife = mk({ name: "Personal", color: "#F59E0B" }, 2);
    const projects = [pWork, pLearn, pLife];

    const goalExam: Goal = {
      id: uuid(),
      projectId: pLearn.id,
      title: "Score 100 on the exam",
      description: "Final exam prep — practice tests plus weak-area drills.",
      targetDate: addDaysStr(today, 14),
      progressMode: "auto_tasks",
      manualProgress: 0,
      status: "active",
      deadlineBehavior: "ask",
      createdAt: now,
      updatedAt: now,
    };
    const goalLaunch: Goal = {
      id: uuid(),
      projectId: pWork.id,
      title: "Ship MVP to first 10 users",
      description: null,
      targetDate: addDaysStr(today, 21),
      progressMode: "milestones",
      manualProgress: 0,
      status: "active",
      deadlineBehavior: "ask",
      createdAt: now,
      updatedAt: now,
    };
    const milestones: Milestone[] = ["Landing page live", "Onboarding flow", "Invite 10 beta users"].map(
      (title, i) => ({
        id: uuid(),
        goalId: goalLaunch.id,
        title,
        done: i === 0,
        sortOrder: (i + 1) * 1000,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const sprint = get().sprints.find((sp) => sp.status === "active");
    const tasks: Task[] = [];
    let order = nextSortOrder(get().tasks);
    const push = (t: Partial<Task> & { title: string }) => {
      order += 1000;
      tasks.push({
        id: uuid(),
        projectId: t.projectId ?? null,
        goalId: t.goalId ?? null,
        sprintId: t.sprintId ?? null,
        title: t.title,
        notes: t.notes ?? null,
        status: t.status ?? "todo",
        priority: t.priority ?? null,
        dueDate: t.dueDate ?? null,
        doDate: t.doDate ?? null,
        estimateMinutes: t.estimateMinutes ?? null,
        recurrence: t.recurrence ?? null,
        sortOrder: order,
        completedAt: t.completedAt ?? null,
        archivedAt: null,
        createdAt: t.createdAt ?? now,
        updatedAt: t.updatedAt ?? now,
      });
    };

    // Inbox notes
    push({ title: "Idea: weekly newsletter for beta users" });
    push({ title: "Look into Tauri auto-updater" });
    push({
      title: "Book dentist appointment",
      createdAt: new Date(Date.now() - 9 * 864e5).toISOString(),
      updatedAt: new Date(Date.now() - 9 * 864e5).toISOString(),
    });

    // Startup
    push({ projectId: pWork.id, goalId: goalLaunch.id, sprintId: sprint?.id ?? null, title: "Design landing page hero", priority: "P1", estimateMinutes: 120, doDate: today, status: "in_progress" });
    push({ projectId: pWork.id, goalId: goalLaunch.id, sprintId: sprint?.id ?? null, title: "Set up analytics events", priority: "P2", estimateMinutes: 60, dueDate: addDaysStr(today, 2) });
    push({ projectId: pWork.id, goalId: goalLaunch.id, title: "Write onboarding emails", priority: "P2", estimateMinutes: 90, dueDate: addDaysStr(today, 5) });
    push({ projectId: pWork.id, title: "Fix signup form validation", priority: "P1", dueDate: addDaysStr(today, -1), estimateMinutes: 45 });
    push({ projectId: pWork.id, title: "Prepare investor update", priority: "P3", estimateMinutes: 60 });
    push({ projectId: pWork.id, title: "Refactor billing module", estimateMinutes: 180 });
    push({ projectId: pWork.id, title: "Interview two design candidates", priority: "P2", doDate: addDaysStr(today, 1) });

    // Learning
    push({ projectId: pLearn.id, goalId: goalExam.id, sprintId: sprint?.id ?? null, title: "Practice test #3", priority: "P1", estimateMinutes: 90, doDate: today });
    push({ projectId: pLearn.id, goalId: goalExam.id, title: "Review chapter 7 mistakes", estimateMinutes: 45, doDate: addDaysStr(today, 1) });
    push({ projectId: pLearn.id, goalId: goalExam.id, title: "Flashcards: formulas", estimateMinutes: 30, recurrence: JSON.stringify({ freq: "daily" }) });
    push({ projectId: pLearn.id, title: "Watch lecture 12", estimateMinutes: 60 });
    push({ projectId: pLearn.id, title: "Summarize reading notes", estimateMinutes: 40 });

    // Personal
    push({ projectId: pLife.id, title: "Morning run", recurrence: JSON.stringify({ freq: "weekdays" }), doDate: today, estimateMinutes: 30 });
    push({ projectId: pLife.id, title: "Plan weekend trip", priority: "P3" });
    push({ projectId: pLife.id, title: "Renew passport", dueDate: addDaysStr(today, 10), priority: "P2" });

    // Completed spread over the past 12 days (feeds charts)
    const doneTitles = [
      ["Ship pricing page copy", pWork.id, goalLaunch.id],
      ["Set up CI pipeline", pWork.id, null],
      ["Customer call notes", pWork.id, null],
      ["Practice test #1", pLearn.id, goalExam.id],
      ["Practice test #2", pLearn.id, goalExam.id],
      ["Chapter 5 exercises", pLearn.id, goalExam.id],
      ["Grocery run", pLife.id, null],
      ["Clean workspace", pLife.id, null],
    ] as const;
    doneTitles.forEach(([title, pid, gid], i) => {
      const when = new Date(Date.now() - (i + 1) * 1.4 * 864e5);
      push({
        projectId: pid,
        goalId: gid,
        title,
        status: "done",
        completedAt: when.toISOString(),
        estimateMinutes: 30 + (i % 4) * 30,
        sprintId: i < 3 ? sprint?.id ?? null : null,
        createdAt: new Date(when.getTime() - 5 * 864e5).toISOString(),
        updatedAt: when.toISOString(),
      });
    });

    const subtasks: Subtask[] = [
      { title: "Hero copy", done: true },
      { title: "Hero illustration", done: false },
      { title: "Responsive pass", done: false },
    ].map((x, i) => ({
      id: uuid(),
      taskId: tasks[3].id,
      title: x.title,
      done: x.done,
      sortOrder: (i + 1) * 1000,
      createdAt: now,
      updatedAt: now,
    }));

    set((s) => ({
      projects: [...s.projects, ...projects],
      goals: [...s.goals, goalExam, goalLaunch],
      milestones: [...s.milestones, ...milestones],
      tasks: [...s.tasks, ...tasks],
      subtasks: [...s.subtasks, ...subtasks],
    }));
    persist(() =>
      Promise.all([
        ...projects.map((p) => repo.upsertProject(p)),
        repo.upsertGoal(goalExam),
        repo.upsertGoal(goalLaunch),
        ...milestones.map((m) => repo.upsertMilestone(m)),
        ...tasks.map((t) => repo.upsertTask(t)),
        ...subtasks.map((st) => repo.upsertSubtask(st)),
      ]),
    );
  },
}));
