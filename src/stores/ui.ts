import { create } from "zustand";
import type { View } from "../types";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error" | "success";
  action?: { label: string; onSelect: () => void };
  duration: number;
}

export interface ConfirmSpec {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface DropClassify {
  taskId: string;
  x: number;
  y: number;
}

interface UIState {
  view: View;
  go(view: View): void;

  detailTaskId: string | null;
  openDetail(id: string | null): void;

  paletteOpen: boolean;
  setPaletteOpen(b: boolean): void;

  planDayOpen: boolean;
  setPlanDayOpen(b: boolean): void;

  reviewOpen: boolean;
  setReviewOpen(b: boolean): void;

  backlogOpen: boolean;
  setBacklogOpen(b: boolean): void;

  confirm: ConfirmSpec | null;
  ask(spec: ConfirmSpec): void;
  closeConfirm(): void;

  toasts: Toast[];
  toast(
    message: string,
    kind?: Toast["kind"],
    action?: Toast["action"],
    durationMs?: number,
  ): void;
  dismissToast(id: number): void;

  /** Ids of tasks currently being dragged — lists hide them so space closes up. */
  draggingIds: string[];
  setDraggingIds(ids: string[]): void;

  /** Single-level undo for the last move operation (⌘Z / toast button). */
  undoAction: { run: () => void } | null;
  setUndo(a: { run: () => void } | null): void;

  dropClassify: DropClassify | null;
  setDropClassify(v: DropClassify | null): void;

  /** Multi-selection of task ids; single click selects exclusively, shift-click toggles. */
  selectedIds: string[];
  select(id: string | null): void;
  toggleSelect(id: string): void;
  clearSelection(): void;

  captureFocusTick: number;
  focusCapture(): void;

  projectModal: { projectId?: string } | null;
  setProjectModal(v: { projectId?: string } | null): void;

  goalModal: { goalId?: string; projectId?: string } | null;
  setGoalModal(v: { goalId?: string; projectId?: string } | null): void;

  goalDeadlineQueue: string[];
  queueGoalDeadlines(ids: string[]): void;
  shiftGoalDeadline(): void;
}

let toastSeq = 1;

export const useUI = create<UIState>((set, get) => ({
  view: { name: "today" },
  go(view) {
    set({ view, selectedIds: [], paletteOpen: false });
  },

  detailTaskId: null,
  openDetail(id) {
    set({ detailTaskId: id, selectedIds: id ? [id] : get().selectedIds });
  },

  paletteOpen: false,
  setPaletteOpen(b) {
    set({ paletteOpen: b });
  },

  planDayOpen: false,
  setPlanDayOpen(b) {
    set({ planDayOpen: b });
  },

  reviewOpen: false,
  setReviewOpen(b) {
    set({ reviewOpen: b });
  },

  backlogOpen: true,
  setBacklogOpen(b) {
    set({ backlogOpen: b });
  },

  confirm: null,
  ask(spec) {
    set({ confirm: spec });
  },
  closeConfirm() {
    set({ confirm: null });
  },

  toasts: [],
  toast(message, kind = "info", action, durationMs) {
    const t: Toast = {
      id: toastSeq++,
      message,
      kind,
      action,
      duration: durationMs ?? (action ? 6000 : 4000),
    };
    set({ toasts: [...get().toasts, t] });
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  draggingIds: [],
  setDraggingIds(ids) {
    set({ draggingIds: ids });
  },

  undoAction: null,
  setUndo(a) {
    set({ undoAction: a });
  },

  dropClassify: null,
  setDropClassify(v) {
    set({ dropClassify: v });
  },

  selectedIds: [],
  select(id) {
    set({ selectedIds: id ? [id] : [] });
  },
  toggleSelect(id) {
    const cur = get().selectedIds;
    set({
      selectedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    });
  },
  clearSelection() {
    set({ selectedIds: [] });
  },

  captureFocusTick: 0,
  focusCapture() {
    set({ captureFocusTick: get().captureFocusTick + 1 });
  },

  projectModal: null,
  setProjectModal(v) {
    set({ projectModal: v });
  },

  goalModal: null,
  setGoalModal(v) {
    set({ goalModal: v });
  },

  goalDeadlineQueue: [],
  queueGoalDeadlines(ids) {
    const existing = get().goalDeadlineQueue;
    const merged = [...existing, ...ids.filter((id) => !existing.includes(id))];
    set({ goalDeadlineQueue: merged });
  },
  shiftGoalDeadline() {
    set({ goalDeadlineQueue: get().goalDeadlineQueue.slice(1) });
  },
}));
