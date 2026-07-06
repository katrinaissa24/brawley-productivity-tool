import { Fragment, useEffect, useMemo, useState } from "react";
import { useData } from "../stores/data";
import { useUI } from "../stores/ui";
import { cn } from "../lib/util";
import { Button, Modal, ModalHeader } from "./ui/primitives";
import { IconPause } from "./icons";

/**
 * Break a task into several by placing dividers between the words of its
 * title. Click a gap to add/remove a divider; each segment becomes a task.
 */
export function BreakdownModal() {
  const taskId = useUI((s) => s.breakdownTaskId);
  const setTaskId = useUI((s) => s.setBreakdownTaskId);
  const tasks = useData((s) => s.tasks);
  const splitTask = useData((s) => s.splitTask);

  const task = taskId ? tasks.find((t) => t.id === taskId) : null;
  const words = useMemo(
    () => (task ? task.title.trim().split(/\s+/).filter(Boolean) : []),
    [task],
  );
  const [dividers, setDividers] = useState<Set<number>>(new Set());

  useEffect(() => {
    setDividers(new Set());
  }, [taskId]);

  // Close automatically if the task vanished or can't be split.
  const invalid = taskId != null && (!task || words.length < 2);
  useEffect(() => {
    if (invalid) setTaskId(null);
  }, [invalid, setTaskId]);

  if (!task || words.length < 2) return null;

  const parts: string[] = [];
  {
    let current: string[] = [];
    words.forEach((w, i) => {
      if (i > 0 && dividers.has(i)) {
        parts.push(current.join(" "));
        current = [];
      }
      current.push(w);
    });
    parts.push(current.join(" "));
  }

  const toggle = (i: number) => {
    setDividers((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const close = () => setTaskId(null);
  const split = () => {
    splitTask(task.id, parts);
    close();
  };

  return (
    <Modal open onClose={close} width={560}>
      <ModalHeader
        title="Break down task"
        subtitle="Click between words to place dividers — each segment becomes its own task."
        onClose={close}
      />
      <div className="px-5 py-3">
        {/* title with clickable gaps */}
        <div className="flex flex-wrap items-center gap-y-2.5 rounded-xl border border-bord bg-panel/50 px-4 py-4 text-[15px] leading-relaxed selectable">
          {words.map((w, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <button
                  onClick={() => toggle(i)}
                  title={dividers.has(i) ? "Remove divider" : "Add divider"}
                  className="group mx-0.5 flex h-7 w-4 items-center justify-center"
                >
                  <span
                    className={cn(
                      "rounded-full transition-all duration-150",
                      dividers.has(i)
                        ? "h-7 w-[3px] bg-accent"
                        : "h-4 w-[3px] bg-bord group-hover:h-6 group-hover:bg-accent/50",
                    )}
                  />
                </button>
              )}
              <span className="text-ink">{w}</span>
            </Fragment>
          ))}
        </div>

        {/* live preview */}
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink3">
            {parts.length === 1
              ? "No dividers yet — one task"
              : `Preview · ${parts.length} tasks`}
          </p>
          <div className="flex flex-col gap-1.5">
            {parts.map((p, i) => (
              <div
                key={i}
                className={cn(
                  "anim-fade flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px]",
                  parts.length > 1 ? "border-bord bg-card text-ink" : "border-dashed border-bord2 text-ink3",
                )}
              >
                <span className="shrink-0 tabular-nums text-[11.5px] font-semibold text-ink3">
                  {i + 1}.
                </span>
                <span className="truncate">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-bord px-5 py-3">
        <span className="text-[11.5px] text-ink3">
          Notes and subtasks stay with task 1
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<IconPause size={13} />}
            disabled={parts.length < 2}
            onClick={split}
          >
            Split into {parts.length} tasks
          </Button>
        </div>
      </div>
    </Modal>
  );
}
