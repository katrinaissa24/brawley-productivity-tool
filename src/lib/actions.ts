import { useData } from "../stores/data";
import { useUI } from "../stores/ui";

/**
 * Move tasks to a project (or the Inbox) with a single-level undo:
 * an "Undo" button on the toast, and ⌘Z. Returns how many tasks moved.
 */
export function moveTasksToProject(ids: string[], projectId: string | null): number {
  const data = useData.getState();
  const ui = useUI.getState();

  const snapshots = ids
    .map((id) => data.tasks.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t != null)
    .filter((t) => t.projectId !== projectId)
    .map((t) => ({ id: t.id, projectId: t.projectId, goalId: t.goalId }));

  if (snapshots.length === 0) return 0;

  for (const s of snapshots) data.updateTask(s.id, { projectId, goalId: null });

  const name = projectId
    ? data.projects.find((p) => p.id === projectId)?.name ?? "project"
    : "Inbox";

  const undo = () => {
    const d = useData.getState();
    const u = useUI.getState();
    for (const s of snapshots) d.updateTask(s.id, { projectId: s.projectId, goalId: s.goalId });
    if (u.dropClassify && snapshots.some((s) => s.id === u.dropClassify?.taskId)) {
      u.setDropClassify(null);
    }
    u.setUndo(null);
    u.toast("Move undone", "info");
  };

  ui.setUndo({ run: undo });
  ui.toast(
    snapshots.length === 1 ? `Added task to ${name}` : `Moved ${snapshots.length} tasks to ${name}`,
    "success",
    { label: "Undo", onSelect: undo },
  );
  return snapshots.length;
}
