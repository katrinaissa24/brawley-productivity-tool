import { getDb } from "./driver";
import type {
  Goal,
  Milestone,
  Project,
  Review,
  Sprint,
  Subtask,
  Task,
} from "../types";

type Row = Record<string, unknown>;

const s = (r: Row, k: string): string => String(r[k]);
const sn = (r: Row, k: string): string | null => (r[k] == null ? null : String(r[k]));
const n = (r: Row, k: string): number => Number(r[k] ?? 0);
const nn = (r: Row, k: string): number | null => (r[k] == null ? null : Number(r[k]));
const b = (r: Row, k: string): boolean => Number(r[k] ?? 0) === 1;

const toProject = (r: Row): Project => ({
  id: s(r, "id"),
  name: s(r, "name"),
  color: s(r, "color"),
  icon: sn(r, "icon"),
  sortOrder: n(r, "sort_order"),
  archivedAt: sn(r, "archived_at"),
  createdAt: s(r, "created_at"),
  updatedAt: s(r, "updated_at"),
});

const toGoal = (r: Row): Goal => ({
  id: s(r, "id"),
  projectId: s(r, "project_id"),
  title: s(r, "title"),
  description: sn(r, "description"),
  targetDate: s(r, "target_date"),
  progressMode: s(r, "progress_mode") as Goal["progressMode"],
  manualProgress: n(r, "manual_progress"),
  status: s(r, "status") as Goal["status"],
  deadlineBehavior: s(r, "deadline_behavior") as Goal["deadlineBehavior"],
  createdAt: s(r, "created_at"),
  updatedAt: s(r, "updated_at"),
});

const toMilestone = (r: Row): Milestone => ({
  id: s(r, "id"),
  goalId: s(r, "goal_id"),
  title: s(r, "title"),
  done: b(r, "done"),
  sortOrder: n(r, "sort_order"),
  createdAt: s(r, "created_at"),
  updatedAt: s(r, "updated_at"),
});

const toTask = (r: Row): Task => ({
  id: s(r, "id"),
  projectId: sn(r, "project_id"),
  goalId: sn(r, "goal_id"),
  sprintId: sn(r, "sprint_id"),
  title: s(r, "title"),
  notes: sn(r, "notes"),
  status: s(r, "status") as Task["status"],
  priority: sn(r, "priority") as Task["priority"],
  dueDate: sn(r, "due_date"),
  doDate: sn(r, "do_date"),
  doTime: sn(r, "do_time"),
  durationMinutes: nn(r, "duration_minutes"),
  rolloverFrom: sn(r, "rollover_from"),
  estimateMinutes: nn(r, "estimate_minutes"),
  recurrence: sn(r, "recurrence"),
  sortOrder: n(r, "sort_order"),
  completedAt: sn(r, "completed_at"),
  archivedAt: sn(r, "archived_at"),
  createdAt: s(r, "created_at"),
  updatedAt: s(r, "updated_at"),
});

const toSubtask = (r: Row): Subtask => ({
  id: s(r, "id"),
  taskId: s(r, "task_id"),
  title: s(r, "title"),
  done: b(r, "done"),
  sortOrder: n(r, "sort_order"),
  createdAt: s(r, "created_at"),
  updatedAt: s(r, "updated_at"),
});

const toSprint = (r: Row): Sprint => ({
  id: s(r, "id"),
  startDate: s(r, "start_date"),
  endDate: s(r, "end_date"),
  status: s(r, "status") as Sprint["status"],
  reviewCompletedAt: sn(r, "review_completed_at"),
  createdAt: s(r, "created_at"),
  updatedAt: s(r, "updated_at"),
});

const toReview = (r: Row): Review => ({
  id: s(r, "id"),
  sprintId: s(r, "sprint_id"),
  reflections: sn(r, "reflections"),
  goalsSnapshot: s(r, "goals_snapshot"),
  createdAt: s(r, "created_at"),
});

export interface DbData {
  projects: Project[];
  goals: Goal[];
  milestones: Milestone[];
  tasks: Task[];
  subtasks: Subtask[];
  sprints: Sprint[];
  reviews: Review[];
  settingsJson: string | null;
}

export async function fetchAll(): Promise<DbData> {
  const db = await getDb();
  const [projects, goals, milestones, tasks, subtasks, sprints, reviews, settingsRows] =
    await Promise.all([
      db.select<Row>("SELECT * FROM projects ORDER BY sort_order"),
      db.select<Row>("SELECT * FROM goals ORDER BY target_date"),
      db.select<Row>("SELECT * FROM milestones ORDER BY sort_order"),
      db.select<Row>("SELECT * FROM tasks ORDER BY sort_order"),
      db.select<Row>("SELECT * FROM subtasks ORDER BY sort_order"),
      db.select<Row>("SELECT * FROM sprints ORDER BY start_date"),
      db.select<Row>("SELECT * FROM reviews ORDER BY created_at DESC"),
      db.select<Row>("SELECT data FROM settings WHERE id = 'app'"),
    ]);
  return {
    projects: projects.map(toProject),
    goals: goals.map(toGoal),
    milestones: milestones.map(toMilestone),
    tasks: tasks.map(toTask),
    subtasks: subtasks.map(toSubtask),
    sprints: sprints.map(toSprint),
    reviews: reviews.map(toReview),
    settingsJson: settingsRows.length ? String(settingsRows[0].data) : null,
  };
}

export async function upsertProject(p: Project): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO projects (id, name, color, icon, sort_order, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.id, p.name, p.color, p.icon, p.sortOrder, p.archivedAt, p.createdAt, p.updatedAt],
  );
}

export async function upsertGoal(g: Goal): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO goals (id, project_id, title, description, target_date, progress_mode, manual_progress, status, deadline_behavior, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      g.id,
      g.projectId,
      g.title,
      g.description,
      g.targetDate,
      g.progressMode,
      g.manualProgress,
      g.status,
      g.deadlineBehavior,
      g.createdAt,
      g.updatedAt,
    ],
  );
}

export async function upsertMilestone(m: Milestone): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO milestones (id, goal_id, title, done, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [m.id, m.goalId, m.title, m.done ? 1 : 0, m.sortOrder, m.createdAt, m.updatedAt],
  );
}

export async function upsertTask(t: Task): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO tasks (id, project_id, goal_id, sprint_id, title, notes, status, priority, due_date, do_date, do_time, duration_minutes, rollover_from, estimate_minutes, recurrence, sort_order, completed_at, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.id,
      t.projectId,
      t.goalId,
      t.sprintId,
      t.title,
      t.notes,
      t.status,
      t.priority,
      t.dueDate,
      t.doDate,
      t.doTime,
      t.durationMinutes,
      t.rolloverFrom,
      t.estimateMinutes,
      t.recurrence,
      t.sortOrder,
      t.completedAt,
      t.archivedAt,
      t.createdAt,
      t.updatedAt,
    ],
  );
}

export async function upsertSubtask(st: Subtask): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO subtasks (id, task_id, title, done, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [st.id, st.taskId, st.title, st.done ? 1 : 0, st.sortOrder, st.createdAt, st.updatedAt],
  );
}

export async function upsertSprint(sp: Sprint): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO sprints (id, start_date, end_date, status, review_completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sp.id, sp.startDate, sp.endDate, sp.status, sp.reviewCompletedAt, sp.createdAt, sp.updatedAt],
  );
}

export async function insertReview(rv: Review): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO reviews (id, sprint_id, reflections, goals_snapshot, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [rv.id, rv.sprintId, rv.reflections, rv.goalsSnapshot, rv.createdAt],
  );
}

const TABLES = ["projects", "goals", "milestones", "tasks", "subtasks", "sprints", "reviews"] as const;
type Table = (typeof TABLES)[number];

export async function deleteRow(table: Table, id: string): Promise<void> {
  if (!TABLES.includes(table)) throw new Error(`bad table ${table}`);
  const db = await getDb();
  await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

export async function deleteWhere(table: Table, column: string, value: string): Promise<void> {
  if (!TABLES.includes(table)) throw new Error(`bad table ${table}`);
  if (!/^[a-z_]+$/.test(column)) throw new Error(`bad column ${column}`);
  const db = await getDb();
  await db.execute(`DELETE FROM ${table} WHERE ${column} = ?`, [value]);
}

export async function saveSettingsJson(json: string): Promise<void> {
  const db = await getDb();
  await db.execute(`INSERT OR REPLACE INTO settings (id, data) VALUES ('app', ?)`, [json]);
}
