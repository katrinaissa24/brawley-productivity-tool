import { useEffect, useState } from "react";
import { useData } from "../stores/data";
import { useUI } from "../stores/ui";
import { goalProgress, overdueActiveGoals } from "../stores/selectors";
import { addDaysStr, formatDateShort, todayStr } from "../lib/util";
import { Button, Modal, ProgressRing } from "./ui/primitives";
import { IconTarget } from "./icons";

/**
 * Watches active goals whose target date has passed and applies the per-goal
 * deadline behavior: ask (dialog queue) / auto_extend (date prompt) /
 * auto_missed / auto_archive (silent + toast).
 */
export function useGoalDeadlines(enabled: boolean) {
  const queueGoalDeadlines = useUI((s) => s.queueGoalDeadlines);

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const data = useData.getState();
      const ui = useUI.getState();
      const overdue = overdueActiveGoals(data.goals);
      const toAsk: string[] = [];
      for (const g of overdue) {
        switch (g.deadlineBehavior) {
          case "auto_missed":
            data.setGoalStatus(g.id, "missed");
            ui.toast(`Goal "${g.title}" marked missed (deadline passed)`, "info");
            break;
          case "auto_archive":
            data.setGoalStatus(g.id, "archived");
            ui.toast(`Goal "${g.title}" archived (deadline passed)`, "info");
            break;
          case "ask":
          case "auto_extend":
            toAsk.push(g.id);
            break;
        }
      }
      if (toAsk.length) queueGoalDeadlines(toAsk);
    };
    // On boot + when the day rolls over while the app is open.
    check();
    let lastDay = todayStr();
    const timer = window.setInterval(() => {
      const now = todayStr();
      if (now !== lastDay) {
        lastDay = now;
        check();
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, queueGoalDeadlines]);
}

export function GoalDeadlineDialog() {
  const queue = useUI((s) => s.goalDeadlineQueue);
  const shift = useUI((s) => s.shiftGoalDeadline);
  const goals = useData((s) => s.goals);
  const tasks = useData((s) => s.tasks);
  const milestones = useData((s) => s.milestones);
  const updateGoal = useData((s) => s.updateGoal);
  const setGoalStatus = useData((s) => s.setGoalStatus);

  const goalId = queue[0];
  const goal = goals.find((g) => g.id === goalId);
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    setNewDate(addDaysStr(todayStr(), 7));
  }, [goalId]);

  // Skip entries that resolved themselves (status changed / date moved).
  useEffect(() => {
    if (goalId && (!goal || goal.status !== "active" || goal.targetDate >= todayStr())) {
      shift();
    }
  }, [goalId, goal, shift]);

  if (!goal || goal.status !== "active" || goal.targetDate >= todayStr()) return null;

  const pct = goalProgress(goal, tasks, milestones);
  const extendOnly = goal.deadlineBehavior === "auto_extend";

  return (
    <Modal open onClose={shift} width={440} closeOnBackdrop={false}>
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-4">
          <ProgressRing pct={pct} size={52} stroke={5} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink3">
              <IconTarget size={12} /> Goal deadline reached
            </p>
            <h2 className="mt-1 text-[15px] font-semibold leading-snug text-ink">{goal.title}</h2>
            <p className="mt-1 text-[13px] text-ink2">
              Hit its target date ({formatDateShort(goal.targetDate)}) at {pct}%.
              {extendOnly ? " Pick a new date." : " What should happen?"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-bord bg-panel/60 px-3 py-2.5">
          <span className="text-[12.5px] text-ink3">New target</span>
          <input
            type="date"
            value={newDate}
            min={todayStr()}
            onChange={(e) => setNewDate(e.target.value)}
            className="h-[26px] rounded-md border border-bord bg-card px-1.5 text-[12.5px] text-ink focus:border-accent/60 focus:outline-none"
          />
          <Button
            size="xs"
            variant="primary"
            className="ml-auto"
            disabled={!newDate}
            onClick={() => {
              updateGoal(goal.id, { targetDate: newDate });
              shift();
            }}
          >
            Extend
          </Button>
        </div>

        {!extendOnly && (
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setGoalStatus(goal.id, "archived");
                shift();
              }}
            >
              Archive
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setGoalStatus(goal.id, "missed");
                shift();
              }}
            >
              Mark missed
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
