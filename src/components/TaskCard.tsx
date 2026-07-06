import { useState, type ReactNode } from "react";
import type { Task } from "../types";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { activeSprint, ageInDays, subtaskProgress } from "../stores/selectors";
import {
  cn,
  formatMinutes,
  PRIORITY_META,
  relativeDayLabel,
  todayStr,
} from "../lib/util";
import { parseRecurrence } from "../lib/recurrence";
import {
  IconArchive,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconFlag,
  IconFolder,
  IconRepeat,
  IconSun,
  IconTarget,
  IconTrash,
  IconZap,
} from "./icons";
import { FloatingMenu, type MenuItem } from "./ui/primitives";

/* ------------------------------ Context menu ------------------------------ */

export function taskMenuItems(task: Task): MenuItem[] {
  const data = useData.getState();
  const ui = useUI.getState();
  const projects = data.projects.filter((p) => !p.archivedAt);
  const sprint = activeSprint(data.sprints);
  const today = todayStr();
  const items: MenuItem[] = [];

  if (task.status !== "done") {
    if (task.doDate !== today) {
      items.push({
        label: "Do today",
        icon: <IconSun size={14} />,
        onSelect: () => data.updateTask(task.id, { doDate: today }),
      });
    } else {
      items.push({
        label: "Remove from Today",
        icon: <IconSun size={14} />,
        onSelect: () => data.updateTask(task.id, { doDate: null }),
      });
    }
    items.push({
      label: "Complete",
      icon: <IconCheck size={14} />,
      onSelect: () => data.completeTask(task.id),
    });
  } else {
    items.push({
      label: "Reopen",
      icon: <IconCheckCircle size={14} />,
      onSelect: () => data.updateTask(task.id, { status: "todo" }),
    });
  }

  items.push({ divider: true, label: "" });

  items.push({
    label: "Move to project",
    icon: <IconFolder size={14} />,
    submenu: [
      ...projects.map((p) => ({
        label: p.name,
        checked: task.projectId === p.id,
        onSelect: () => data.updateTask(task.id, { projectId: p.id }),
      })),
      { divider: true, label: "" },
      {
        label: "Inbox",
        checked: task.projectId === null,
        onSelect: () => data.updateTask(task.id, { projectId: null, goalId: null }),
      },
    ],
  });

  items.push({
    label: "Set priority",
    icon: <IconFlag size={14} />,
    submenu: (["P1", "P2", "P3", null] as const).map((pr) => ({
      label: pr ? PRIORITY_META[pr].label : "None",
      checked: task.priority === pr,
      onSelect: () => data.updateTask(task.id, { priority: pr }),
    })),
  });

  if (sprint && task.status !== "done") {
    if (task.sprintId === sprint.id) {
      items.push({
        label: "Remove from sprint",
        icon: <IconZap size={14} />,
        onSelect: () => data.removeFromSprint(task.id),
      });
    } else {
      items.push({
        label: "Add to sprint",
        icon: <IconZap size={14} />,
        onSelect: () => data.commitToSprint(task.id, sprint.id),
      });
    }
  }

  items.push({ divider: true, label: "" });
  items.push({
    label: "Archive",
    icon: <IconArchive size={14} />,
    onSelect: () => data.archiveTask(task.id),
  });
  items.push({
    label: "Delete",
    icon: <IconTrash size={14} />,
    danger: true,
    onSelect: () =>
      ui.ask({
        title: "Delete task?",
        message: `"${task.title}" will be permanently deleted. Archiving keeps it recoverable.`,
        confirmLabel: "Delete",
        danger: true,
        onConfirm: () => data.deleteTaskHard(task.id),
      }),
  });

  return items;
}

/* --------------------------------- Chips ---------------------------------- */

function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 h-[18px] px-1.5 rounded-md text-[11px] font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function TaskChips({ task, showProject }: { task: Task; showProject?: boolean }) {
  const projects = useData((s) => s.projects);
  const goals = useData((s) => s.goals);
  const subtasks = useData((s) => s.subtasks);
  const settings = useSettings((s) => s.settings);

  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const goal = task.goalId ? goals.find((g) => g.id === task.goalId) : null;
  const subs = subtaskProgress(subtasks.filter((st) => st.taskId === task.id));
  const today = todayStr();
  const overdue = task.dueDate != null && task.dueDate < today && task.status !== "done";
  const recur = parseRecurrence(task.recurrence);
  const isInbox = task.projectId === null;
  const age = ageInDays(task.createdAt);

  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      {showProject && project && (
        <Chip className="text-ink3 bg-transparent px-0" title={project.name}>
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: project.color }} />
          <span className="truncate max-w-[110px]">{project.name}</span>
        </Chip>
      )}
      {task.priority && (
        <Chip className={PRIORITY_META[task.priority].chip}>
          {PRIORITY_META[task.priority].label}
        </Chip>
      )}
      {task.dueDate && (
        <Chip
          title={`Due ${task.dueDate}`}
          className={
            overdue
              ? "text-red-600 dark:text-red-400 bg-red-500/10"
              : "text-ink3 bg-panel"
          }
        >
          <IconCalendar size={11} />
          {overdue ? `Overdue · ${relativeDayLabel(task.dueDate)}` : relativeDayLabel(task.dueDate)}
        </Chip>
      )}
      {task.estimateMinutes != null && task.estimateMinutes > 0 && (
        <Chip className="text-ink3 bg-panel" title="Estimate">
          <IconClock size={11} />
          {formatMinutes(task.estimateMinutes)}
        </Chip>
      )}
      {subs.total > 0 && (
        <Chip className="text-ink3 bg-panel" title="Subtasks">
          <IconCheck size={11} />
          {subs.done}/{subs.total}
        </Chip>
      )}
      {goal && (
        <Chip className="text-accent bg-accent/10" title={`Goal: ${goal.title}`}>
          <IconTarget size={11} />
          <span className="truncate max-w-[110px]">{goal.title}</span>
        </Chip>
      )}
      {recur && (
        <Chip className="text-ink3 bg-panel" title="Recurring">
          <IconRepeat size={11} />
        </Chip>
      )}
      {isInbox && age >= settings.inboxAgingDays && (
        <Chip className="text-amber-600 dark:text-amber-400 bg-amber-500/10" title="Sitting in the inbox for a while — sort or delete it">
          {age}d
        </Chip>
      )}
    </div>
  );
}

/* ------------------------------- Checkbox --------------------------------- */

export function TaskCheck({
  done,
  onToggle,
  priority,
}: {
  done: boolean;
  onToggle: () => void;
  priority?: Task["priority"];
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "group/check mt-[1px] h-[16px] w-[16px] shrink-0 rounded-full border-[1.5px] transition-all duration-150 flex items-center justify-center",
        done
          ? "bg-accent border-accent text-white"
          : cn(
              "hover:border-accent hover:bg-accent/10",
              priority === "P1"
                ? "border-red-400"
                : priority === "P2"
                  ? "border-orange-400"
                  : "border-bord2",
            ),
      )}
      title={done ? "Reopen" : "Complete"}
    >
      <IconCheck
        size={10}
        strokeWidth={2.6}
        className={cn(
          "transition-opacity",
          done ? "opacity-100" : "opacity-0 group-hover/check:opacity-60 text-accent",
        )}
      />
    </button>
  );
}

/* -------------------------------- TaskCard -------------------------------- */

export function TaskCard({
  task,
  showProject,
  dense,
  className,
}: {
  task: Task;
  showProject?: boolean;
  dense?: boolean;
  className?: string;
}) {
  const updateTask = useData((s) => s.updateTask);
  const openDetail = useUI((s) => s.openDetail);
  const select = useUI((s) => s.select);
  const toggleSelect = useUI((s) => s.toggleSelect);
  const selected = useUI((s) => s.selectedIds.includes(task.id));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const done = task.status === "done";

  const toggle = () => {
    if (done) {
      updateTask(task.id, { status: "todo" });
    } else {
      setLeaving(true);
      window.setTimeout(() => useData.getState().completeTask(task.id), 190);
    }
  };

  return (
    <>
      <div
        data-task-card={task.id}
        onClick={(e) => {
          if (e.shiftKey || e.metaKey) {
            toggleSelect(task.id);
            return;
          }
          select(task.id);
          openDetail(task.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!useUI.getState().selectedIds.includes(task.id)) select(task.id);
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={cn(
          "group relative rounded-card border bg-card px-3 transition-all duration-200 cursor-default",
          dense ? "py-2" : "py-2.5",
          selected
            ? "border-accent/60 ring-2 ring-accent/15"
            : "border-bord hover:border-bord2 hover:shadow-cardHover",
          leaving && "opacity-0 scale-[0.97]",
          done && !leaving && "opacity-60",
          className,
        )}
      >
        <div className="flex items-start gap-2.5">
          <TaskCheck done={done} onToggle={toggle} priority={task.priority} />
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-[13.5px] leading-snug text-ink break-words",
                done && "line-through text-ink3",
              )}
            >
              {task.title}
            </p>
            <div className="mt-1 empty:hidden">
              <TaskChips task={task} showProject={showProject} />
            </div>
          </div>
        </div>
      </div>
      {menu && <FloatingMenu x={menu.x} y={menu.y} items={taskMenuItems(task)} onClose={() => setMenu(null)} />}
    </>
  );
}
