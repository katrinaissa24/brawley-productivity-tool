// Typed models mirroring the SQLite schema (see src/db/migrations).

export type Priority = "P1" | "P2" | "P3";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type GoalStatus = "active" | "completed" | "missed" | "archived";
export type ProgressMode = "auto_tasks" | "manual" | "milestones";
export type DeadlineBehavior = "ask" | "auto_extend" | "auto_missed" | "auto_archive";
export type SprintStatus = "active" | "completed";

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  targetDate: string; // yyyy-MM-dd, required
  progressMode: ProgressMode;
  manualProgress: number; // 0-100
  status: GoalStatus;
  deadlineBehavior: DeadlineBehavior;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  done: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string | null; // null = Inbox
  goalId: string | null;
  sprintId: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: Priority | null;
  dueDate: string | null; // hard deadline
  doDate: string | null; // planned work day — drives Today
  estimateMinutes: number | null;
  recurrence: string | null; // serialized Recurrence JSON
  sortOrder: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  reviewCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  sprintId: string;
  reflections: string | null;
  goalsSnapshot: string; // JSON: ReviewSnapshot
  createdAt: string;
}

export interface Recurrence {
  freq: "daily" | "weekdays" | "weekly" | "every_n_days" | "monthly";
  days?: number[]; // weekly: 0=Sun..6=Sat
  n?: number; // every_n_days
}

export type GoalMark = "on_track" | "at_risk" | "off_track";

export interface GoalCheck {
  goalId: string;
  title: string;
  progress: number;
  daysLeft: number;
  mark: GoalMark;
  note?: string;
}

export interface ReviewSnapshot {
  sprintLabel: string;
  startDate: string;
  endDate: string;
  stats: {
    committed: number;
    done: number;
    estimateDoneMinutes: number;
  };
  goals: GoalCheck[];
}

export interface ShortcutMap {
  globalCapture: string;
  newTask: string;
  commandPalette: string;
  settings: string;
  completeTask: string;
  editTask: string;
  goInbox: string;
  goToday: string;
  goSprint: string;
  goReview: string;
  goInsights: string;
  goFirstProject: string;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  accentColor: string; // hex
  sprintLengthDays: number;
  sprintStartDow: number; // 0=Sun .. 6=Sat
  blockedEnabled: boolean;
  wipLimitEnabled: boolean;
  wipLimit: number;
  defaultPriority: Priority | null;
  staleDays: number;
  inboxAgingDays: number;
  boardDoneRetentionDays: number; // 0 = collapse Done column to a count
  todayCap: number;
  planMyDayEnabled: boolean;
  goalDefaultProgressMode: ProgressMode;
  goalDeadlineBehavior: DeadlineBehavior;
  sprintCapacityHours: number;
  reflectionEnabled: boolean;
  notifMaster: boolean;
  notifMorning: boolean;
  notifMorningTime: string; // "09:00"
  notifDue: boolean;
  notifReview: boolean;
  notifGoal: boolean;
  shortcuts: ShortcutMap;
  onboardingDone: boolean;
  lastPlanDate: string | null;
  viewPrefs: Record<string, string>;
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  globalCapture: "mod+shift+space",
  newTask: "mod+n",
  commandPalette: "mod+k",
  settings: "mod+,",
  completeTask: "mod+enter",
  editTask: "e",
  goInbox: "mod+1",
  goToday: "mod+2",
  goSprint: "mod+3",
  goReview: "mod+4",
  goInsights: "mod+5",
  goFirstProject: "mod+6",
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accentColor: "#6366F1",
  sprintLengthDays: 7,
  sprintStartDow: 1,
  blockedEnabled: false,
  wipLimitEnabled: true,
  wipLimit: 2,
  defaultPriority: null,
  staleDays: 14,
  inboxAgingDays: 7,
  boardDoneRetentionDays: 0,
  todayCap: 5,
  planMyDayEnabled: true,
  goalDefaultProgressMode: "auto_tasks",
  goalDeadlineBehavior: "ask",
  sprintCapacityHours: 20,
  reflectionEnabled: true,
  notifMaster: true,
  notifMorning: true,
  notifMorningTime: "09:00",
  notifDue: true,
  notifReview: true,
  notifGoal: true,
  shortcuts: DEFAULT_SHORTCUTS,
  onboardingDone: false,
  lastPlanDate: null,
  viewPrefs: {},
};

export type View =
  | { name: "inbox" }
  | { name: "today" }
  | { name: "sprint" }
  | { name: "review" }
  | { name: "insights" }
  | { name: "project"; projectId: string }
  | { name: "goal"; goalId: string }
  | { name: "settings"; section?: string }
  | { name: "archive" };
