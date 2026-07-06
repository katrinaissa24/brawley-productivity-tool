import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useData } from "../stores/data";
import { useUI } from "../stores/ui";
import { activeProjects } from "../stores/selectors";
import { plural } from "../lib/util";
import { FloatingMenu, type MenuItem } from "./ui/primitives";
import { IconFolder, IconTrash, IconX } from "./icons";

/** Deletes the given tasks after one confirm; shared with the Delete-key shortcut. */
export function confirmDeleteTasks(ids: string[]) {
  if (ids.length === 0) return;
  const ui = useUI.getState();
  ui.ask({
    title: ids.length === 1 ? "Delete task?" : `Delete ${ids.length} tasks?`,
    message:
      ids.length === 1
        ? "It will be permanently deleted. Archiving keeps it recoverable."
        : "They will be permanently deleted. Archiving keeps things recoverable.",
    confirmLabel: ids.length === 1 ? "Delete" : "Delete all",
    danger: true,
    onConfirm: () => {
      const data = useData.getState();
      const u = useUI.getState();
      for (const id of ids) data.deleteTaskHard(id);
      if (u.detailTaskId && ids.includes(u.detailTaskId)) u.openDetail(null);
      u.clearSelection();
    },
  });
}

/** Floating action bar shown while 2+ tasks are shift-selected. */
export function BulkBar() {
  const selectedIds = useUI((s) => s.selectedIds);
  const clearSelection = useUI((s) => s.clearSelection);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const moveRef = useRef<HTMLButtonElement>(null);

  if (selectedIds.length < 2) return null;

  const moveItems = (): MenuItem[] => {
    const data = useData.getState();
    const ui = useUI.getState();
    const ids = ui.selectedIds;
    const move = (projectId: string | null, name: string) => {
      for (const id of ids) data.updateTask(id, { projectId, goalId: null });
      ui.toast(`Moved ${plural(ids.length, "task")} to ${name}`, "success");
      ui.clearSelection();
    };
    return [
      ...activeProjects(data.projects).map((p) => ({
        label: p.name,
        onSelect: () => move(p.id, p.name),
      })),
      { divider: true, label: "" },
      { label: "Inbox", onSelect: () => move(null, "Inbox") },
    ];
  };

  return createPortal(
    <>
      <div className="anim-slide-up fixed bottom-5 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-bord bg-pop px-2 py-1.5 shadow-pop">
        <span className="px-2 text-[12.5px] font-medium text-ink tabular-nums">
          {selectedIds.length} selected
        </span>
        <span className="h-4 w-px bg-bord" />
        <button
          ref={moveRef}
          onClick={() => {
            const r = moveRef.current!.getBoundingClientRect();
            const approxH = (activeProjects(useData.getState().projects).length + 2) * 30 + 16;
            setMenu({ x: r.left, y: Math.max(8, r.top - approxH - 6) });
          }}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-ink/5"
        >
          <IconFolder size={13} className="text-ink3" />
          Move to
        </button>
        <button
          onClick={() => confirmDeleteTasks(useUI.getState().selectedIds)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/10"
        >
          <IconTrash size={13} />
          Delete
        </button>
        <span className="h-4 w-px bg-bord" />
        <button
          onClick={clearSelection}
          title="Clear selection (Esc)"
          className="rounded-lg p-1.5 text-ink3 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <IconX size={13} />
        </button>
      </div>
      {menu && <FloatingMenu x={menu.x} y={menu.y} items={moveItems()} onClose={() => setMenu(null)} />}
    </>,
    document.body,
  );
}
