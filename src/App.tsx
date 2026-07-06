import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Project, Task } from "./types";
import { useData } from "./stores/data";
import { useSettings } from "./stores/settings";
import { useUI } from "./stores/ui";
import { activeProjects } from "./stores/selectors";
import { reorderIds, todayStr } from "./lib/util";
import { isEditableTarget, matchCombo } from "./lib/shortcuts";
import type { DragData, DropData } from "./components/dnd";
import { collisionDetection } from "./components/dnd";
import { Sidebar } from "./components/Sidebar";
import { TaskCard } from "./components/TaskCard";
import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { PlanDayModal } from "./components/PlanDayModal";
import { GoalModal } from "./components/GoalModal";
import { ClassifyPopover, ConfirmDialog, ProjectModal, Toasts } from "./components/AppModals";
import { GoalDeadlineDialog, useGoalDeadlines } from "./components/GoalDeadlineDialog";
import { InboxView } from "./views/InboxView";
import { TodayView } from "./views/TodayView";
import { ProjectView } from "./views/ProjectView";
import { SettingsView } from "./views/SettingsView";
import { SprintView } from "./views/SprintView";
import { GoalView } from "./views/GoalView";
import { ArchiveView, InsightsView, ReviewView } from "./views/stubs";

/* ------------------------------- boot (once) ------------------------------- */

let bootPromise: Promise<void> | null = null;
function boot(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      const settingsJson = await useData.getState().loadAll();
      useSettings.getState().init(settingsJson);
      useData.getState().ensureActiveSprint();
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
        if (editable) {
          (e.target as HTMLElement).blur();
          return;
        }
        if (ui.paletteOpen) return ui.setPaletteOpen(false);
        if (ui.dropClassify) return ui.setDropClassify(null);
        if (ui.detailTaskId) return ui.openDetail(null);
        if (ui.selectedTaskId) return ui.select(null);
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
        const id = ui.detailTaskId ?? ui.selectedTaskId;
        if (id) {
          e.preventDefault();
          data.completeTask(id);
        }
        return;
      }
      if (!editable && matchCombo(e, sc.editTask)) {
        if (ui.selectedTaskId) {
          e.preventDefault();
          ui.openDetail(ui.selectedTaskId);
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

export default function App() {
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [dragProject, setDragProject] = useState<Project | null>(null);

  useEffect(() => {
    boot()
      .then(() => setBooted(true))
      .catch((e) => {
        console.error("boot failed", e);
        setBootError(String(e));
      });
  }, []);

  useGlobalShortcuts(booted);
  useGoalDeadlines(booted);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DragData | undefined;
    if (d?.type === "task") setDragTask(d.task);
    if (d?.type === "project") {
      const p = useData.getState().projects.find((x) => x.id === d.projectId);
      setDragProject(p ?? null);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragTask(null);
    setDragProject(null);
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

    // task drags
    const t = data.tasks.find((x) => x.id === a.task.id);
    if (!t) return;

    if (o.type === "project") {
      if (t.projectId !== o.projectId) {
        const wasInbox = t.projectId === null;
        data.updateTask(t.id, { projectId: o.projectId, goalId: null });
        if (wasInbox) {
          const rect = e.over.rect;
          ui.setDropClassify({
            taskId: t.id,
            x: rect.left + rect.width + 14,
            y: rect.top - 2,
          });
        }
      }
      return;
    }

    if (o.type === "backlog") {
      if (t.sprintId) data.removeFromSprint(t.id);
      return;
    }

    if (o.type === "column") {
      if (o.sprintId && t.sprintId !== o.sprintId) data.commitToSprint(t.id, o.sprintId);
      if (t.status !== o.status) {
        const r = data.trySetStatus(t.id, o.status);
        if (!r.ok && r.msg) ui.toast(r.msg, "error");
        if (!r.ok) return;
      }
      // drop at end of column
      const lastId = o.listIds.filter((id) => id !== t.id).pop();
      if (lastId) {
        const last = data.tasks.find((x) => x.id === lastId);
        if (last) data.applySortOrders([{ id: t.id, sortOrder: last.sortOrder + 1000 }], "task");
      }
      return;
    }

    if (o.type === "task") {
      const overTask = data.tasks.find((x) => x.id === o.task.id);
      if (!overTask || overTask.id === t.id) return;
      const sameList = a.listIds.includes(overTask.id) && a.listIds.includes(t.id);
      if (!sameList) {
        // adopt the over task's container (status / sprint) before ordering
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
          <p className="text-[15px] font-semibold text-ink">Flow couldn't start</p>
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
          <span className="text-[13px] font-medium text-ink3">Flow</span>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragTask(null);
        setDragProject(null);
      }}
    >
      <div className="flex h-screen w-screen overflow-hidden bg-app text-ink">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <CurrentView />
        </main>
      </div>

      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }}>
        {dragTask && (
          <div className="pointer-events-none rotate-[1.5deg] opacity-95">
            <TaskCard task={dragTask} showProject />
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
      <ConfirmDialog />
      <Toasts />
    </DndContext>
  );
}
