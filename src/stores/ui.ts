import { create } from "zustand";
import type { View } from "../types";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error" | "success";
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
  toast(message: string, kind?: Toast["kind"]): void;
  dismissToast(id: number): void;

  dropClassify: DropClassify | null;
  setDropClassify(v: DropClassify | null): void;

  selectedTaskId: string | null;
  select(id: string | null): void;

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
    set({ view, selectedTaskId: null, paletteOpen: false });
  },

  detailTaskId: null,
  openDetail(id) {
    set({ detailTaskId: id, selectedTaskId: id ?? get().selectedTaskId });
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
  toast(message, kind = "info") {
    const t: Toast = { id: toastSeq++, message, kind };
    set({ toasts: [...get().toasts, t] });
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  dropClassify: null,
  setDropClassify(v) {
    set({ dropClassify: v });
  },

  selectedTaskId: null,
  select(id) {
    set({ selectedTaskId: id });
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
