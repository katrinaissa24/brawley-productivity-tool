import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Project, Task } from "./types";
import { useData } from "./stores/data";
import { useSettings } from "./stores/settings";
import { useUI } from "./stores/ui";
import { activeProjects } from "./stores/selectors";
import { reorderIds, todayStr } from "./lib/util";
import { moveTasksToProject } from "./lib/actions";
import { comboToAccelerator, isEditableTarget, matchCombo } from "./lib/shortcuts";
import { syncGlobalShortcut } from "./lib/native";
import { startNotificationScheduler } from "./lib/notifications";
import { isTauri } from "./db/driver";
import type { DragData, DropData } from "./components/dnd";
import { collisionDetection } from "./lib/collision";
import { Sidebar } from "./components/Sidebar";
import { TaskCard } from "./components/TaskCard";
import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { PlanDayModal } from "./components/PlanDayModal";
import { GoalModal } from "./components/GoalModal";
import { ClassifyPopover, ConfirmDialog, ProjectModal, Toasts } from "./components/AppModals";
import { GoalDeadlineDialog, useGoalDeadlines } from "./components/GoalDeadlineDialog";
import { CommandPalette } from "./components/CommandPalette";
import { Onboarding } from "./components/Onboarding";
import { BulkBar, confirmDeleteTasks } from "./components/BulkBar";
import { BreakdownModal } from "./components/BreakdownModal";
import { InboxView } from "./views/InboxView";
import { TodayView } from "./views/TodayView";
import { CalendarView } from "./views/CalendarView";
import { ProjectView } from "./views/ProjectView";
import { SettingsView } from "./views/SettingsView";
import { SprintView } from "./views/SprintView";
import { GoalView } from "./views/GoalView";
import { ReviewView } from "./views/ReviewView";
import { InsightsView } from "./views/InsightsView";
import { ArchiveView } from "./views/ArchiveView";

/* ------------------------------- boot (once) ------------------------------- */

let bootPromise: Promise<void> | null = null;
function boot(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      const settingsJson = await useData.getState().loadAll();
      useSettings.getState().init(settingsJson);
      useData.getState().ensureActiveSprint();
      useData.getState().rolloverOverdueTasks();

      if (isTauri) {
        // Capture window inserts → reload; keep the user's global shortcut registered.
        const { listen } = await import("@tauri-apps/api/event");
        void listen("flow:data-changed", () => void useData.getState().refresh());
        const combo = useSettings.getState().settings.shortcuts.globalCapture;
        void syncGlobalShortcut(comboToAccelerator(combo)).catch((e) =>
          console.warn("global shortcut registration failed", e),
        );
        // Quietly check GitHub for a newer signed release a few seconds after
        // launch; prompts only if one is actually available.
        const { checkForUpdate } = await import("./lib/updater");
        window.setTimeout(() => void checkForUpdate({ silent: true }), 4000);
      }
      startNotificationScheduler();
    })();
  }
  return bootPromise;
}

/* ------------------------------ keyboard layer ----------------------------- */

function useGlobalShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      const data = useData.getState();
      const sc = useSettings.getState().settings.shortcuts;
      const editable = isEditableTarget(e);

      if (e.key === "Escape") {
        if (ui.paletteOpen) return ui.setPaletteOpen(false);
        if (editable) {
          (e.target as HTMLElement).blur();
          return;
        }
        if (ui.dropClassify) return ui.setDropClassify(null);
        if (ui.detailTaskId) return ui.openDetail(null);
        if (ui.selectedIds.length) return ui.clearSelection();
        return;
      }

      if (!editable && (e.key === "Backspace" || e.key === "Delete")) {
        if (ui.selectedIds.length > 0) {
          e.preventDefault();
          confirmDeleteTasks(ui.selectedIds);
        }
        return;
      }

      if (!editable && matchCombo(e, "mod+z")) {
        if (ui.undoAction) {
          e.preventDefault();
          ui.undoAction.run();
        }
        return;
      }

      if (matchCombo(e, sc.commandPalette)) {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      if (matchCombo(e, sc.settings)) {
        e.preventDefault();
        ui.go({ name: "settings" });
        return;
      }
      if (matchCombo(e, sc.goInbox)) return e.preventDefault(), ui.go({ name: "inbox" });
      if (matchCombo(e, sc.goToday)) return e.preventDefault(), ui.go({ name: "today" });
      if (matchCombo(e, sc.goSprint)) return e.preventDefault(), ui.go({ name: "sprint" });
      if (matchCombo(e, sc.goReview)) return e.preventDefault(), ui.go({ name: "review" });
      if (matchCombo(e, sc.goInsights)) return e.preventDefault(), ui.go({ name: "insights" });
      if (matchCombo(e, sc.goFirstProject)) {
        e.preventDefault();
        const first = activeProjects(data.projects)[0];
        if (first) ui.go({ name: "project", projectId: first.id });
        return;
      }
      if (matchCombo(e, sc.newTask)) {
        e.preventDefault();
        const view = ui.view;
        if (view.name === "project") {
          const t = data.addTask({
            title: "New task",
            projectId: view.projectId,
            priority: useSettings.getState().settings.defaultPriority,
          });
          ui.openDetail(t.id);
        } else if (view.name === "inbox") {
          ui.focusCapture();
        } else {
          ui.go({ name: "inbox" });
          setTimeout(() => ui.focusCapture(), 30);
        }
        return;
      }
      if (matchCombo(e, sc.completeTask)) {
        const ids = ui.detailTaskId ? [ui.detailTaskId] : ui.selectedIds;
        if (ids.length) {
          e.preventDefault();
          for (const id of ids) data.completeTask(id);
          if (ids.length > 1) ui.clearSelection();
        }
        return;
      }
      if (!editable && matchCombo(e, sc.editTask)) {
        if (ui.selectedIds.length === 1) {
          e.preventDefault();
          ui.openDetail(ui.selectedIds[0]);
        }
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/* ---------------------------------- views ---------------------------------- */

function CurrentView() {
  const view = useUI((s) => s.view);
  switch (view.name) {
    case "inbox":
      return <InboxView />;
    case "today":
      return <TodayView />;
    case "sprint":
      return <SprintView />;
    case "review":
      return <ReviewView />;
    case "insights":
      return <InsightsView />;
    case "calendar":
      return <CalendarView />;
    case "project":
      return <ProjectView key={view.projectId} projectId={view.projectId} />;
    case "goal":
      return <GoalView key={view.goalId} goalId={view.goalId} />;
    case "settings":
      return <SettingsView />;
    case "archive":
      return <ArchiveView />;
  }
}

/* ----------------------------------- app ----------------------------------- */

/** Stack of cards shown while dragging a multi-selection — gathers to the cursor. */
function GroupDragOverlay({ tasks }: { tasks: Task[] }) {
  const [gathered, setGathered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGathered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const shown = tasks.slice(0, 4);
  return (
    <div className="pointer-events-none relative w-[300px]">
      {shown.map((t, i) => (
        <div
          key={t.id}
          className="absolute left-0 top-0 w-full"
          style={{
            zIndex: shown.length - i,
            transform: gathered
              ? `translate(${i * 5}px, ${i * 7}px) rotate(${i * 1.3}deg)`
              : `translate(0px, ${i * 58}px)`,
            opacity: gathered && i > 0 ? Math.max(0.55, 0.92 - i * 0.14) : 1,
            transition: "transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1), opacity 220ms ease",
          }}
        >
          <TaskCard task={t} showProject={i === 0} dense={i > 0} />
        </div>
      ))}
      <span className="absolute -right-2.5 -top-2.5 z-50 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-bold text-white shadow-pop">
        {tasks.length}
      </span>
      {/* invisible sizer so the overlay has real dimensions */}
      <div className="invisible">
        <TaskCard task={shown[0]} showProject />
      </div>
    </div>
  );
}

/** Compact pill shown instead of the full card while dragging over the sidebar. */
function MiniDragPill({ task, count }: { task: Task; count: number }) {
  const project = useData((s) => s.projects.find((p) => p.id === task.projectId));
  return (
    <div className="anim-pop pointer-events-none flex h-[30px] max-w-[210px] items-center gap-1.5 rounded-lg border border-bord bg-pop px-2.5 shadow-pop">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: project?.color ?? "rgb(var(--c-accent))" }}
      />
      <span className="truncate text-[12px] font-medium text-ink">{task.title}</span>
      {count > 1 && (
        <span className="ml-0.5 inline-flex h-[16px] shrink-0 items-center rounded-full bg-accent px-1.5 text-[10.5px] font-bold text-white">
          {count}
        </span>
      )}
    </div>
  );
}

const SIDEBAR_ZONE_PX = 248;

export default function App() {
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [dragTasks, setDragTasks] = useState<Task[] | null>(null);
  const [dragProject, setDragProject] = useState<Project | null>(null);
  const [overSidebar, setOverSidebar] = useState(false);

  useEffect(() => {
    // Defensive: a hot-reload or crash mid-drag must never leave tasks hidden.
    useUI.getState().setDraggingIds([]);
    document.body.classList.remove("is-dragging");
    boot()
      .then(() => setBooted(true))
      .catch((e) => {
        console.error("boot failed", e);
        setBootError(String(e));
      });
  }, []);

  useEffect(() => {
    // Roll unfinished tasks forward when the calendar day flips while running.
    let day = todayStr();
    const id = window.setInterval(() => {
      const now = todayStr();
      if (now !== day) {
        day = now;
        useData.getState().rolloverOverdueTasks();
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useGlobalShortcuts(booted);
  useGoalDeadlines(booted);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const onDragStart = (e: DragStartEvent) => {
    document.body.classList.add("is-dragging");
    setOverSidebar(false);
    const d = e.active.data.current as DragData | undefined;
    if (d?.type === "task") {
      const sel = useUI.getState().selectedIds;
      let group: Task[];
      if (sel.includes(d.task.id) && sel.length > 1) {
        const rest = useData
          .getState()
          .tasks.filter((t) => sel.includes(t.id) && t.id !== d.task.id);
        group = [d.task, ...rest];
      } else {
        group = [d.task];
      }
      setDragTasks(group);
      // Hide the originals — lists close the gap while the cards ride the cursor.
      useUI.getState().setDraggingIds(group.map((t) => t.id));
    }
    if (d?.type === "project") {
      const p = useData.getState().projects.find((x) => x.id === d.projectId);
      setDragProject(p ?? null);
    }
  };

  const onDragMove = (e: DragMoveEvent) => {
    if (!dragTasks) return;
    const activator = e.activatorEvent as Partial<PointerEvent> | null;
    const startX = typeof activator?.clientX === "number" ? activator.clientX : null;
    if (startX === null) return;
    const x = startX + e.delta.x;
    const over = x < SIDEBAR_ZONE_PX;
    setOverSidebar((prev) => (prev === over ? prev : over));
  };

  const endDrag = () => {
    document.body.classList.remove("is-dragging");
    setDragTasks(null);
    setDragProject(null);
    setOverSidebar(false);
    useUI.getState().setDraggingIds([]);
  };

  const onDragEnd = (e: DragEndEvent) => {
    endDrag();
    const a = e.active.data.current as DragData | undefined;
    const o = e.over?.data.current as DropData | undefined;
    if (!a || !e.over || !o) return;
    const data = useData.getState();
    const ui = useUI.getState();

    if (a.type === "project") {
      if (o.type === "project" && a.projectId !== o.projectId) {
        const ids = activeProjects(data.projects).map((p) => p.id);
        const from = ids.indexOf(a.projectId);
        const to = ids.indexOf(o.projectId);
        if (from >= 0 && to >= 0) {
          data.applySortOrders(reorderIds(ids, from, to), "project");
        }
      }
      return;
    }

    // task drags — a drag of a selected card carries the whole selection
    const t = data.tasks.find((x) => x.id === a.task.id);
    if (!t) return;
    const sel = ui.selectedIds;
    const groupIds =
      sel.includes(t.id) && sel.length > 1
        ? [t.id, ...sel.filter((id) => id !== t.id)]
        : [t.id];
    const group = groupIds
      .map((id) => data.tasks.find((x) => x.id === id))
      .filter(Boolean) as Task[];

    /** Set status (and sprint membership) on every dragged task; toast once if WIP blocks some. */
    const adoptContainer = (
      status: Task["status"],
      sprintId: string | null,
      unassign?: boolean,
    ): Task[] => {
      const moved: Task[] = [];
      let blockedMsg: string | null = null;
      for (const task of group) {
        if (sprintId && task.sprintId !== sprintId) data.commitToSprint(task.id, sprintId);
        if (unassign && task.sprintId) data.removeFromSprint(task.id);
        if (task.status !== status) {
          const r = data.trySetStatus(task.id, status);
          if (!r.ok) {
            if (r.msg) blockedMsg = r.msg;
            continue;
          }
        }
        moved.push(task);
      }
      if (blockedMsg) ui.toast(blockedMsg, "error");
      return moved;
    };

    if (o.type === "project") {
      const wasSingleInboxNote = group.length === 1 && t.projectId === null;
      const movedCount = moveTasksToProject(groupIds, o.projectId);
      if (movedCount > 0) {
        if (wasSingleInboxNote) {
          const rect = e.over.rect;
          ui.setDropClassify({
            taskId: t.id,
            x: rect.left + rect.width + 14,
            y: rect.top - 2,
          });
        }
        if (group.length > 1) ui.clearSelection();
      }
      return;
    }

    if (o.type === "backlog") {
      for (const task of group) if (task.sprintId) data.removeFromSprint(task.id);
      return;
    }

    if (o.type === "column") {
      const moved = adoptContainer(o.status, o.sprintId, o.unassign);
      if (o.resetRollover) {
        // Dropping into a Today section is a fresh commitment — clear "Do later".
        for (const task of moved) {
          if (task.rolloverFrom != null) data.updateTask(task.id, { doDate: todayStr() });
        }
      }
      // append at the end of the column, keeping the dragged order
      const lastId = o.listIds.filter((id) => !groupIds.includes(id)).pop();
      const last = lastId ? data.tasks.find((x) => x.id === lastId) : undefined;
      const base = last ? last.sortOrder : undefined;
      if (base !== undefined && moved.length) {
        data.applySortOrders(
          moved.map((task, k) => ({ id: task.id, sortOrder: base + (k + 1) * 1000 })),
          "task",
        );
      }
      return;
    }

    if (o.type === "task") {
      const overTask = data.tasks.find((x) => x.id === o.task.id);
      if (!overTask || groupIds.includes(overTask.id)) return;

      if (group.length > 1) {
        // group: adopt target container, then park the stack right after the target
        const moved = adoptContainer(overTask.status, overTask.sprintId);
        if (moved.length) {
          data.applySortOrders(
            moved.map((task, k) => ({ id: task.id, sortOrder: overTask.sortOrder + k + 1 })),
            "task",
          );
        }
        return;
      }

      const sameList = a.listIds.includes(overTask.id) && a.listIds.includes(t.id);
      if (!sameList) {
        if (overTask.sprintId && t.sprintId !== overTask.sprintId) {
          data.commitToSprint(t.id, overTask.sprintId);
        }
        if (t.status !== overTask.status) {
          const r = data.trySetStatus(t.id, overTask.status);
          if (!r.ok && r.msg) {
            ui.toast(r.msg, "error");
            return;
          }
        }
        data.reorderTaskInList(o.listIds, t.id, overTask.id);
      } else {
        data.reorderTaskInList(a.listIds, t.id, overTask.id);
      }
      return;
    }
  };

  if (bootError) {
    return (
      <div className="flex h-screen items-center justify-center bg-app px-8">
        <div className="max-w-[420px] rounded-xl border border-red-500/30 bg-card p-6 shadow-card">
          <p className="text-[15px] font-semibold text-ink">Brawley couldn't start</p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink2">
            The database failed to open. Try restarting the app — if it persists, your data file
            may be locked by another process.
          </p>
          <p className="mt-3 rounded-lg bg-panel p-2 text-[11px] text-ink3 font-mono break-all selectable">
            {bootError}
          </p>
        </div>
      </div>
    );
  }

  if (!booted) {
    return (
      <div className="flex h-screen items-center justify-center bg-app">
        <div className="flex flex-col items-center gap-3 anim-fade">
          <div className="h-10 w-10 rounded-xl bg-accent shadow-cardHover animate-pulse" />
          <span className="text-[13px] font-medium text-ink3">Brawley</span>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      <div className="flex h-screen w-screen overflow-hidden bg-app text-ink">
        <Sidebar />
        <main className="relative min-w-0 flex-1">
          <CurrentView />
        </main>
      </div>

      <DragOverlay
        className="drag-overlay-autosize"
        dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }}
      >
        {dragTasks && overSidebar && (
          <MiniDragPill task={dragTasks[0]} count={dragTasks.length} />
        )}
        {dragTasks && !overSidebar && dragTasks.length > 1 && (
          <GroupDragOverlay tasks={dragTasks} />
        )}
        {dragTasks && !overSidebar && dragTasks.length === 1 && (
          <div className="pointer-events-none w-[300px] rotate-[1.5deg] opacity-95">
            <TaskCard task={dragTasks[0]} showProject />
          </div>
        )}
        {dragProject && (
          <div className="pointer-events-none flex items-center gap-2.5 rounded-lg border border-bord bg-pop px-2.5 py-1.5 text-[13px] shadow-pop">
            <span className="h-[9px] w-[9px] rounded-full" style={{ background: dragProject.color }} />
            {dragProject.name}
          </div>
        )}
      </DragOverlay>

      <TaskDetailPanel />
      <PlanDayModal />
      <ProjectModal />
      <GoalModal />
      <ClassifyPopover />
      <GoalDeadlineDialog />
      <CommandPalette />
      <Onboarding />
      <BulkBar />
      <BreakdownModal />
      <ConfirmDialog />
      <Toasts />
    </DndContext>
  );
}
