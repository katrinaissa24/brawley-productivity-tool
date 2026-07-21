import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskStatus } from "../types";
import { useUI } from "../stores/ui";
import { cn } from "../lib/util";

/** Data payloads discriminated by `type` on active/over. */
export type DragData =
  | { type: "task"; task: Task; listIds: string[] }
  | { type: "project"; projectId: string };

export type DropData =
  | { type: "task"; task: Task; listIds: string[] }
  | { type: "project-row"; projectId: string }
  | { type: "project"; projectId: string }
  | {
      type: "column";
      status: TaskStatus;
      /** Commit dropped tasks to this sprint (project To Do / sprint columns). */
      sprintId: string | null;
      /** Remove dropped tasks from their sprint (project Backlog column). */
      unassign?: boolean;
      /** Today columns: dropping a rolled-over task re-commits it to today. */
      resetRollover?: boolean;
      listIds: string[];
    }
  | { type: "backlog" };

/** Sortable wrapper for task cards inside ordered lists / board columns. */
export function SortableTask({
  task,
  listIds,
  children,
  disabled,
}: {
  task: Task;
  listIds: string[];
  children: ReactNode;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    disabled,
    data: { type: "task", task, listIds } satisfies DragData,
  });
  // While this task rides the cursor, keep the node MOUNTED (unmounting the
  // active draggable kills the drag) as a zero-height clipped box: it keeps its
  // position+width (correct overlay anchor) but takes no visual space.
  // `overflow-hidden` clips the child on the same frame the slot collapses —
  // without it the card's own `transition-all` would fade its inherited
  // visibility over 200ms, leaving a ghost silhouette behind the cursor.
  const lifted = useUI((s) => s.draggingIds.includes(task.id));
  return (
    <div
      ref={setNodeRef}
      style={lifted ? undefined : { transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative cursor-grab", lifted && "h-0 -mb-2 overflow-hidden")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

/** Board column droppable area. */
export function DroppableColumn({
  id,
  status,
  sprintId,
  unassign,
  resetRollover,
  listIds,
  children,
  className,
}: {
  id: string;
  status: TaskStatus;
  sprintId: string | null;
  unassign?: boolean;
  resetRollover?: boolean;
  listIds: string[];
  children: (isOver: boolean) => ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `col:${id}`,
    data: { type: "column", status, sprintId, unassign, resetRollover, listIds } satisfies DropData,
  });
  const taskOver = isOver && active?.data.current?.type === "task";
  return (
    <div ref={setNodeRef} className={className}>
      {children(taskOver)}
    </div>
  );
}

/** Generic droppable zone (e.g. sprint backlog panel). */
export function DroppableZone({
  id,
  data,
  children,
  className,
}: {
  id: string;
  data: DropData;
  children: (isOver: boolean) => ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return (
    <div ref={setNodeRef} className={className}>
      {children(isOver)}
    </div>
  );
}
