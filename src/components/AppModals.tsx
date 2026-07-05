import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useData } from "../stores/data";
import { useUI } from "../stores/ui";
import { cn, PROJECT_COLORS } from "../lib/util";
import { Button, Modal, ModalHeader, Segmented, Select, TextInput } from "./ui/primitives";
import { IconAlert, IconCheck, IconX } from "./icons";

/* ------------------------------ Confirm dialog ----------------------------- */

export function ConfirmDialog() {
  const confirm = useUI((s) => s.confirm);
  const closeConfirm = useUI((s) => s.closeConfirm);
  if (!confirm) return null;
  return (
    <Modal open onClose={closeConfirm} width={400}>
      <div className="px-5 pt-5">
        <div className="flex items-start gap-3">
          {confirm.danger && (
            <span className="mt-0.5 rounded-full bg-red-500/10 p-1.5 text-red-500">
              <IconAlert size={16} />
            </span>
          )}
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{confirm.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">{confirm.message}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 py-4">
        <Button variant="ghost" onClick={closeConfirm}>
          Cancel
        </Button>
        <Button
          variant={confirm.danger ? "danger" : "primary"}
          onClick={() => {
            confirm.onConfirm();
            closeConfirm();
          }}
        >
          {confirm.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}

/* --------------------------------- Toasts ---------------------------------- */

function ToastItem({ id, message, kind }: { id: number; message: string; kind: string }) {
  const dismissToast = useUI((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismissToast(id), 4000);
    return () => clearTimeout(t);
  }, [id, dismissToast]);
  return (
    <div
      className={cn(
        "anim-slide-up pointer-events-auto flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-pop backdrop-blur",
        kind === "error"
          ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          : kind === "success"
            ? "border-accent/30 bg-accent/10 text-ink"
            : "border-bord bg-pop text-ink",
      )}
    >
      {kind === "success" && <IconCheck size={14} className="text-accent" />}
      {kind === "error" && <IconAlert size={14} />}
      <span className="max-w-[420px]">{message}</span>
      <button onClick={() => dismissToast(id)} className="ml-1 text-ink3 hover:text-ink">
        <IconX size={12} />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>,
    document.body,
  );
}

/* ------------------------------ Project modal ------------------------------ */

export function ProjectModal() {
  const modal = useUI((s) => s.projectModal);
  const setModal = useUI((s) => s.setProjectModal);
  const ask = useUI((s) => s.ask);
  const go = useUI((s) => s.go);
  const view = useUI((s) => s.view);
  const projects = useData((s) => s.projects);
  const addProject = useData((s) => s.addProject);
  const updateProject = useData((s) => s.updateProject);
  const archiveProject = useData((s) => s.archiveProject);

  const editing = modal?.projectId ? projects.find((p) => p.id === modal.projectId) : null;
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [icon, setIcon] = useState("");

  useEffect(() => {
    if (modal) {
      setName(editing?.name ?? "");
      setColor(editing?.color ?? PROJECT_COLORS[Math.floor(Math.random() * 6)]);
      setIcon(editing?.icon ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.projectId, modal != null]);

  if (!modal) return null;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing) {
      updateProject(editing.id, { name: trimmed, color, icon: icon.trim() || null });
    } else {
      const p = addProject({ name: trimmed, color, icon: icon.trim() || null });
      go({ name: "project", projectId: p.id });
    }
    setModal(null);
  };

  return (
    <Modal open onClose={() => setModal(null)} width={420}>
      <ModalHeader
        title={editing ? "Edit project" : "New project"}
        onClose={() => setModal(null)}
      />
      <div className="flex flex-col gap-4 px-4 py-3">
        <div className="flex gap-2">
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Project name"
          />
          <TextInput
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 2))}
            placeholder="⌘"
            title="Optional icon (emoji)"
            className="w-[52px] text-center"
          />
        </div>
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-ink3">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "h-6 w-6 rounded-full transition-transform hover:scale-110",
                  color === c && "ring-2 ring-offset-2 ring-offset-pop ring-accent scale-110",
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-bord">
        {editing ? (
          <Button
            variant="ghost"
            onClick={() =>
              ask({
                title: "Archive project?",
                message: `"${editing.name}" will be hidden from the sidebar. Its tasks are preserved and everything can be restored from Settings → Archive.`,
                confirmLabel: "Archive",
                onConfirm: () => {
                  archiveProject(editing.id);
                  setModal(null);
                  if (view.name === "project" && view.projectId === editing.id) {
                    go({ name: "today" });
                  }
                },
              })
            }
          >
            Archive project
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setModal(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            {editing ? "Save" : "Create project"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------- Classify-after-drop popover ---------------------- */

export function ClassifyPopover() {
  const spec = useUI((s) => s.dropClassify);
  const setSpec = useUI((s) => s.setDropClassify);
  const openDetail = useUI((s) => s.openDetail);
  const tasks = useData((s) => s.tasks);
  const goals = useData((s) => s.goals);
  const projects = useData((s) => s.projects);
  const updateTask = useData((s) => s.updateTask);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const task = spec ? tasks.find((t) => t.id === spec.taskId) : null;

  useLayoutEffect(() => {
    if (!spec || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(spec.x, window.innerWidth - r.width - 12),
      y: Math.min(spec.y, window.innerHeight - r.height - 12),
    });
  }, [spec]);

  useEffect(() => {
    if (!spec) {
      setPos(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSpec(null);
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setSpec(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [spec, setSpec]);

  if (!spec || !task) return null;
  const project = projects.find((p) => p.id === task.projectId);
  const projectGoals = goals.filter((g) => g.projectId === task.projectId && g.status === "active");

  return createPortal(
    <div
      ref={ref}
      className="anim-pop fixed z-[60] w-[280px] rounded-xl border border-bord bg-pop p-3 shadow-pop"
      style={{ left: pos?.x ?? spec.x, top: pos?.y ?? spec.y, visibility: pos ? "visible" : "hidden" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] text-ink3">
          Filed to <span className="font-medium text-ink2">{project?.name}</span>
        </span>
        <button onClick={() => setSpec(null)} className="text-ink3 hover:text-ink">
          <IconX size={13} />
        </button>
      </div>
      <p className="mb-3 truncate text-[13px] font-medium text-ink">{task.title}</p>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink3">Priority</span>
          <Segmented
            value={task.priority ?? "none"}
            onChange={(v) => updateTask(task.id, { priority: v === "none" ? null : (v as "P1") })}
            options={[
              { value: "P1", label: "P1" },
              { value: "P2", label: "P2" },
              { value: "P3", label: "P3" },
              { value: "none", label: "—" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink3">Due</span>
          <input
            type="date"
            value={task.dueDate ?? ""}
            onChange={(e) => updateTask(task.id, { dueDate: e.target.value || null })}
            className="h-[26px] rounded-md border border-bord bg-card px-1.5 text-[12px] text-ink focus:border-accent/60 focus:outline-none"
          />
        </div>
        {projectGoals.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink3">Goal</span>
            <Select
              value={task.goalId ?? ""}
              onChange={(v) => updateTask(task.id, { goalId: v || null })}
              placeholder="None"
              className="h-[26px] max-w-[170px] text-[12px]"
              options={projectGoals.map((g) => ({ value: g.id, label: g.title }))}
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-bord pt-2.5">
        <button
          onClick={() => {
            openDetail(task.id);
            setSpec(null);
          }}
          className="text-[12px] text-accent hover:underline"
        >
          Open details
        </button>
        <Button size="xs" variant="primary" onClick={() => setSpec(null)}>
          Done
        </Button>
      </div>
    </div>,
    document.body,
  );
}
