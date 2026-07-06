import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { useData } from "../stores/data";
import { useUI } from "../stores/ui";
import { inboxTasks } from "../stores/selectors";
import { cn, plural } from "../lib/util";
import { CaptureBar } from "../components/CaptureBar";
import { TaskCard } from "../components/TaskCard";
import { ViewShell } from "../components/ViewShell";
import { EmptyState, Kbd } from "../components/ui/primitives";
import { IconInbox } from "../components/icons";
import type { DragData } from "../components/dnd";

function DraggableNote({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { type: "task", task, listIds: [] } satisfies DragData,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("cursor-grab", isDragging && "opacity-30 z-30 relative")}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} />
    </div>
  );
}

export function InboxView() {
  const tasks = useData((s) => s.tasks);
  const draggingIds = useUI((s) => s.draggingIds);
  const notes = inboxTasks(tasks).filter((t) => !draggingIds.includes(t.id));

  return (
    <ViewShell
      title="Inbox"
      meta={
        notes.length > 0
          ? `${plural(notes.length, "unsorted note")} — drag onto a project to file it`
          : "Capture first, organize later"
      }
    >
      <div className="max-w-[660px]">
        <CaptureBar />
        {notes.length === 0 ? (
          <EmptyState
            icon={<IconInbox size={30} />}
            title="Brain empty. Nice."
            hint={
              <>
                Capture anything from anywhere with <Kbd combo="mod+shift+space" /> — it lands
                here, ready to be sorted when you are.
              </>
            }
          />
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {notes.map((t) => (
              <DraggableNote key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>
    </ViewShell>
  );
}
