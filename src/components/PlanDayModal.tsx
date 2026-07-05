import { useMemo, useState } from "react";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { activeSprint, planCandidates, todayLists } from "../stores/selectors";
import { cn, formatMinutes, todayStr } from "../lib/util";
import { Button, Modal, ModalHeader } from "./ui/primitives";
import { IconCheck } from "./icons";
import { TaskChips } from "./TaskCard";

const REASON_LABEL: Record<string, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  sprint_p1: "Sprint · P1",
  sprint: "Sprint",
  priority: "High priority",
};

export function PlanDayModal() {
  const open = useUI((s) => s.planDayOpen);
  const setOpen = useUI((s) => s.setPlanDayOpen);
  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const sprints = useData((s) => s.sprints);
  const updateTask = useData((s) => s.updateTask);
  const settings = useSettings((s) => s.settings);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const sprint = activeSprint(sprints);
  const candidates = useMemo(
    () => planCandidates(tasks, projects, sprint?.id ?? null),
    [tasks, projects, sprint],
  );
  const existing = todayLists(tasks, projects, settings.todayCap);
  const existingCount = existing.focus.length + existing.later.length;
  const slots = Math.max(0, settings.todayCap - existingCount);

  if (!open) return null;

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else if (next.size < slots) next.add(id);
    setPicked(next);
  };

  const confirm = () => {
    const today = todayStr();
    for (const id of picked) updateTask(id, { doDate: today });
    setPicked(new Set());
    setOpen(false);
  };

  const close = () => {
    setPicked(new Set());
    setOpen(false);
  };

  return (
    <Modal open={open} onClose={close} width={560}>
      <ModalHeader
        title="Plan my day"
        subtitle={
          slots === 0
            ? `Today is full (${existingCount}/${settings.todayCap}) — clear something first, or raise the cap in Settings.`
            : `Pick up to ${slots} ${slots === 1 ? "task" : "tasks"} — ${picked.size} selected. Small list, real progress.`
        }
        onClose={close}
      />
      <div className="px-4 pb-2 pt-2 max-h-[46vh] overflow-y-auto">
        {candidates.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink3">
            No obvious candidates — nothing overdue, due soon, or high-priority in the sprint.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {candidates.slice(0, 30).map(({ task, reason }) => {
              const on = picked.has(task.id);
              const full = !on && picked.size >= slots;
              return (
                <button
                  key={task.id}
                  onClick={() => toggle(task.id)}
                  disabled={full}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-150",
                    on
                      ? "border-accent/60 bg-accent/5 ring-1 ring-accent/30"
                      : "border-bord bg-card hover:border-bord2",
                    full && "opacity-45",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                      on ? "border-accent bg-accent text-white" : "border-bord2",
                    )}
                  >
                    {on && <IconCheck size={10} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{task.title}</span>
                    <span className="mt-1 block">
                      <TaskChips task={task} showProject />
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md bg-panel px-1.5 py-0.5 text-[11px] font-medium text-ink3">
                    {REASON_LABEL[reason]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-bord px-4 py-3">
        <span className="text-xs text-ink3">
          {picked.size > 0 &&
            `~${formatMinutes(
              [...picked].reduce(
                (acc, id) => acc + (tasks.find((t) => t.id === id)?.estimateMinutes ?? 0),
                0,
              ),
            )} selected`}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Skip today
          </Button>
          <Button variant="primary" onClick={confirm} disabled={picked.size === 0}>
            Add {picked.size > 0 ? picked.size : ""} to Today
          </Button>
        </div>
      </div>
    </Modal>
  );
}
