import { useMemo, useState } from "react";
import type { GoalCheck, GoalMark, ReviewSnapshot, Task } from "../types";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import {
  activeGoals,
  activeSprint,
  backlogTasks,
  goalProgress,
  isOpen,
  sprintLabel,
  sprintTasks,
  staleTasks,
  workloadMinutes,
} from "../stores/selectors";
import { cn, daysUntil, formatMinutes, plural, todayStr } from "../lib/util";
import { Doughnut } from "../components/charts";
import { TaskChips } from "../components/TaskCard";
import { Button, ProgressBar, ProgressRing, Segmented, TextArea } from "../components/ui/primitives";
import { IconCheck, IconCheckCircle, IconChevronLeft, IconSparkle, IconX } from "../components/icons";

type StaleAction = "keep" | "do" | "defer" | "delete";
type Decision = "rollover" | "backlog" | "archive";

const STEP_TITLES = ["Recap", "Triage", "Goals", "Reflect", "Plan", "Done"];

export function ReviewWizard() {
  const setReviewOpen = useUI((s) => s.setReviewOpen);
  const ask = useUI((s) => s.ask);
  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const goals = useData((s) => s.goals);
  const milestones = useData((s) => s.milestones);
  const sprints = useData((s) => s.sprints);
  const settings = useSettings((s) => s.settings);

  const sprint = activeSprint(sprints);

  const [step, setStep] = useState(0);
  const [staleActions, setStaleActions] = useState<Record<string, StaleAction>>({});
  const [goalChecks, setGoalChecks] = useState<Record<string, { mark: GoalMark; note: string }>>({});
  const [reflections, setReflections] = useState("");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState<string | null>(null);

  const committed = useMemo(
    () => (sprint ? sprintTasks(tasks, projects, sprint.id) : []),
    [tasks, projects, sprint],
  );
  const done = committed.filter((t) => t.status === "done");
  const unfinished = committed.filter(isOpen);
  const stale = useMemo(
    () =>
      staleTasks(tasks, projects, settings.staleDays).filter(
        (t) => t.sprintId !== sprint?.id,
      ),
    [tasks, projects, settings.staleDays, sprint],
  );
  const checkGoals = useMemo(() => activeGoals(goals), [goals]);

  const steps = useMemo(() => {
    const s = ["recap", "stale", "goals"];
    if (settings.reflectionEnabled) s.push("reflection");
    s.push("plan", "done");
    return s;
  }, [settings.reflectionEnabled]);

  if (!sprint) {
    setReviewOpen(false);
    return null;
  }

  const current = steps[step];
  const isLast = current === "done";

  const close = () => {
    if (finished || step === 0) return setReviewOpen(false);
    ask({
      title: "Abandon review?",
      message: "Your progress in this review will be lost. The sprint stays open.",
      confirmLabel: "Abandon",
      danger: true,
      onConfirm: () => setReviewOpen(false),
    });
  };

  const doneMinutes = workloadMinutes(done);

  /* ------------------------------ plan helpers ------------------------------ */

  const atRiskGoalIds = new Set(
    Object.entries(goalChecks)
      .filter(([, v]) => v.mark !== "on_track")
      .map(([id]) => id),
  );
  const suggestions = useMemo(() => {
    if (!sprint) return [];
    const soon = todayStr();
    const pool = backlogTasks(tasks, projects, sprint.id).filter(
      (t) => staleActions[t.id] !== "delete" && staleActions[t.id] !== "defer",
    );
    const reason = (t: Task): { label: string; rank: number } | null => {
      if (t.goalId && atRiskGoalIds.has(t.goalId)) return { label: "At-risk goal", rank: 0 };
      if (t.priority === "P1") return { label: "P1", rank: 1 };
      if (t.dueDate && daysUntil(t.dueDate) <= 7) {
        return { label: t.dueDate < soon ? "Overdue" : "Due soon", rank: 2 };
      }
      if (t.priority === "P2") return { label: "P2", rank: 3 };
      return { label: "", rank: 5 };
    };
    return pool
      .map((t) => ({ task: t, r: reason(t) ?? { label: "", rank: 9 } }))
      .sort((a, b) => a.r.rank - b.r.rank || (a.task.createdAt < b.task.createdAt ? -1 : 1));
  }, [tasks, projects, sprint, staleActions, atRiskGoalIds]);

  const rolloverIds = unfinished.filter((t) => (decisions[t.id] ?? "rollover") === "rollover").map((t) => t.id);
  const staleDoIds = stale.filter((t) => staleActions[t.id] === "do").map((t) => t.id);
  const nextCommitted = [
    ...rolloverIds,
    ...staleDoIds,
    ...[...picked].filter((id) => !rolloverIds.includes(id) && !staleDoIds.includes(id)),
  ];
  const nextMinutes = workloadMinutes(
    nextCommitted.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as Task[],
  );
  const capacityMinutes = settings.sprintCapacityHours * 60;

  /* --------------------------------- finish --------------------------------- */

  const finish = () => {
    const data = useData.getState();
    // stale actions first
    for (const t of stale) {
      const a = staleActions[t.id] ?? "keep";
      if (a === "defer") data.updateTask(t.id, { doDate: null });
      if (a === "delete") data.deleteTaskHard(t.id);
    }
    const snapshot: ReviewSnapshot = {
      sprintLabel: sprintLabel(sprint),
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      stats: {
        committed: committed.length,
        done: done.length,
        estimateDoneMinutes: doneMinutes,
      },
      goals: checkGoals.map((g): GoalCheck => {
        const c = goalChecks[g.id];
        return {
          goalId: g.id,
          title: g.title,
          progress: goalProgress(g, tasks, milestones),
          daysLeft: daysUntil(g.targetDate),
          mark: c?.mark ?? "on_track",
          note: c?.note || undefined,
        };
      }),
    };
    data.finishReview({
      sprintId: sprint.id,
      decisions,
      pickedTaskIds: [...picked, ...staleDoIds],
      reflections: reflections.trim() || null,
      snapshot,
    });
    const fresh = activeSprint(useData.getState().sprints);
    setFinished(fresh ? sprintLabel(fresh) : "");
  };

  /* ---------------------------------- steps --------------------------------- */

  const stepBody = () => {
    switch (current) {
      case "recap":
        return (
          <div className="anim-fade">
            <div className="flex items-center gap-8 rounded-2xl border border-bord bg-card px-8 py-7 shadow-card">
              <Doughnut done={done.length} total={committed.length} size={120} thickness={12} label="completed" />
              <div>
                <p className="text-[17px] font-semibold text-ink">
                  You completed {done.length} of {plural(committed.length, "committed task")}.
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink2">
                  {doneMinutes > 0 && <>~{formatMinutes(doneMinutes)} of estimated work done · </>}
                  {unfinished.length > 0
                    ? `${unfinished.length} still open — you'll decide their fate in a minute.`
                    : "Everything closed out. Clean sweep."}
                </p>
              </div>
            </div>
            <p className="mt-4 text-center text-[12.5px] text-ink3">
              Sprint · {sprintLabel(sprint)}
            </p>
          </div>
        );

      case "stale":
        return (
          <div className="anim-fade">
            <p className="mb-4 text-[13.5px] leading-relaxed text-ink2">
              These open tasks haven't been touched in {settings.staleDays}+ days. Decide now — a
              rotting list is what makes the whole thing overwhelming.
            </p>
            {stale.length === 0 ? (
              <div className="rounded-2xl border border-bord bg-card px-6 py-10 text-center shadow-card">
                <IconCheckCircle size={28} className="mx-auto text-accent" />
                <p className="mt-2 text-[14px] font-medium text-ink">Nothing is rotting. Nice.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {stale.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-bord bg-card px-3.5 py-2.5 shadow-card">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-ink">{t.title}</p>
                      <div className="mt-1">
                        <TaskChips task={t} showProject />
                      </div>
                    </div>
                    <Segmented
                      value={staleActions[t.id] ?? "keep"}
                      onChange={(v) => setStaleActions((s) => ({ ...s, [t.id]: v }))}
                      options={[
                        { value: "keep", label: "Keep" },
                        { value: "do", label: "Do", title: "Add to next sprint" },
                        { value: "defer", label: "Defer", title: "Clear do-date, keep in backlog" },
                        { value: "delete", label: "Delete" },
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "goals":
        return (
          <div className="anim-fade">
            <p className="mb-4 text-[13.5px] leading-relaxed text-ink2">
              The point of the ritual: are you actually on track? Be honest — "at risk" now beats
              "missed" later.
            </p>
            {checkGoals.length === 0 ? (
              <div className="rounded-2xl border border-bord bg-card px-6 py-10 text-center shadow-card">
                <p className="text-[14px] font-medium text-ink">No active goals</p>
                <p className="mt-1 text-[12.5px] text-ink3">Create one from any project page.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {checkGoals.map((g) => {
                  const pct = goalProgress(g, tasks, milestones);
                  const left = daysUntil(g.targetDate);
                  const check = goalChecks[g.id];
                  return (
                    <div key={g.id} className="rounded-xl border border-bord bg-card px-4 py-3 shadow-card">
                      <div className="flex items-center gap-3.5">
                        <ProgressRing pct={pct} size={42} stroke={4.5} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium text-ink">{g.title}</p>
                          <p className={cn("mt-0.5 text-[12px]", left < 0 ? "text-red-500" : left <= 7 ? "text-orange-500" : "text-ink3")}>
                            {left < 0 ? `${-left}d past target` : left === 0 ? "Due today" : `${left}d remaining`}
                          </p>
                        </div>
                        <Segmented
                          value={check?.mark ?? "on_track"}
                          onChange={(v) =>
                            setGoalChecks((s) => ({ ...s, [g.id]: { mark: v, note: s[g.id]?.note ?? "" } }))
                          }
                          options={[
                            { value: "on_track", label: "On track" },
                            { value: "at_risk", label: "At risk" },
                            { value: "off_track", label: "Off track" },
                          ]}
                        />
                      </div>
                      {(check?.mark === "at_risk" || check?.mark === "off_track" || check?.note) && (
                        <input
                          value={check?.note ?? ""}
                          onChange={(e) =>
                            setGoalChecks((s) => ({
                              ...s,
                              [g.id]: { mark: s[g.id]?.mark ?? "on_track", note: e.target.value },
                            }))
                          }
                          placeholder="Why? One honest sentence… (optional)"
                          className="mt-2.5 w-full rounded-lg border border-bord bg-panel/50 px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink3 focus:border-accent/50"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case "reflection":
        return (
          <div className="anim-fade">
            <p className="mb-4 text-[13.5px] leading-relaxed text-ink2">
              What worked? What didn't? Two minutes of honesty — future-you reads these.
            </p>
            <TextArea
              autoFocus
              value={reflections}
              onChange={(e) => setReflections(e.target.value)}
              rows={9}
              placeholder={"## What worked\n\n## What didn't\n\n(markdown supported — skip if you're not feeling it)"}
              className="text-[13.5px] leading-relaxed"
            />
          </div>
        );

      case "plan":
        return (
          <div className="anim-fade">
            {unfinished.length > 0 && (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-ink3">
                    Unfinished from this sprint · {unfinished.length}
                  </p>
                  <div className="flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setDecisions(Object.fromEntries(unfinished.map((t) => [t.id, "rollover" as Decision])))}>
                      Roll all over
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setDecisions(Object.fromEntries(unfinished.map((t) => [t.id, "backlog" as Decision])))}>
                      All to backlog
                    </Button>
                  </div>
                </div>
                <div className="mb-5 flex flex-col gap-2">
                  {unfinished.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-xl border border-bord bg-card px-3.5 py-2.5 shadow-card">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] text-ink">{t.title}</p>
                        <div className="mt-1">
                          <TaskChips task={t} showProject />
                        </div>
                      </div>
                      <Segmented
                        value={decisions[t.id] ?? "rollover"}
                        onChange={(v) => setDecisions((s) => ({ ...s, [t.id]: v }))}
                        options={[
                          { value: "rollover", label: "Roll over" },
                          { value: "backlog", label: "Backlog" },
                          { value: "archive", label: "Archive" },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink3">
              Add from backlog {suggestions.length > 0 && `· suggestions first`}
            </p>
            <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto pr-1">
              {suggestions.length === 0 && (
                <p className="rounded-xl border border-dashed border-bord2 px-4 py-5 text-center text-[12.5px] text-ink3">
                  Backlog is empty — nothing else to pull in.
                </p>
              )}
              {suggestions.slice(0, 40).map(({ task: t, r }) => {
                const on = picked.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(t.id)) n.delete(t.id);
                        else n.add(t.id);
                        return n;
                      })
                    }
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all",
                      on ? "border-accent/60 bg-accent/5 ring-1 ring-accent/25" : "border-bord bg-card hover:border-bord2",
                    )}
                  >
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border", on ? "border-accent bg-accent text-white" : "border-bord2")}>
                      {on && <IconCheck size={10} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{t.title}</span>
                      <span className="mt-0.5 block">
                        <TaskChips task={t} showProject />
                      </span>
                    </span>
                    {r.label && (
                      <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium", r.rank === 0 ? "bg-orange-500/15 text-orange-600 dark:text-orange-400" : "bg-panel text-ink3")}>
                        {r.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* capacity */}
            <div className="mt-4 rounded-xl border border-bord bg-card px-4 py-3 shadow-card">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-ink2">
                  Next sprint: {plural(nextCommitted.length, "task")} · ~{formatMinutes(nextMinutes)}
                </span>
                <span className={cn("font-medium", nextMinutes > capacityMinutes ? "text-orange-500" : "text-ink3")}>
                  capacity hint {settings.sprintCapacityHours}h
                </span>
              </div>
              <ProgressBar
                pct={(nextMinutes / Math.max(1, capacityMinutes)) * 100}
                color={nextMinutes > capacityMinutes ? "#f97316" : undefined}
                className="mt-2"
              />
              {nextMinutes > capacityMinutes && (
                <p className="mt-1.5 text-[11.5px] text-orange-500">
                  Over the hint — ambitious is fine, overwhelming isn't. Consider trimming.
                </p>
              )}
            </div>
          </div>
        );

      case "done":
        return finished !== null ? (
          <div className="anim-scale rounded-2xl border border-bord bg-card px-8 py-12 text-center shadow-card">
            <IconCheckCircle size={40} className="mx-auto text-accent" />
            <p className="mt-4 text-[17px] font-semibold text-ink">Review saved. Sprint closed.</p>
            <p className="mt-1.5 text-[13.5px] text-ink2">
              New sprint · {finished} — {plural(nextCommitted.length, "task")} committed.
            </p>
            <Button variant="primary" className="mt-6" onClick={() => setReviewOpen(false)}>
              Back to work
            </Button>
          </div>
        ) : (
          <div className="anim-fade rounded-2xl border border-bord bg-card px-8 py-10 text-center shadow-card">
            <IconSparkle size={30} className="mx-auto text-accent" />
            <p className="mt-3 text-[16px] font-semibold text-ink">Ready to close it out?</p>
            <p className="mx-auto mt-2 max-w-[380px] text-[13px] leading-relaxed text-ink2">
              This completes the sprint, saves the review with a snapshot of your goals, applies
              your triage decisions, and starts the next sprint with{" "}
              {plural(nextCommitted.length, "task")} (~{formatMinutes(nextMinutes)}).
            </p>
            <Button variant="primary" className="mt-6" icon={<IconCheck size={14} />} onClick={finish}>
              Close sprint & start next
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-app anim-fade">
      {/* header */}
      <div data-tauri-drag-region className="flex shrink-0 items-center justify-between px-8 pb-2 pt-9">
        <span className="text-[13px] font-semibold text-ink">
          Weekly Review <span className="text-ink3 font-normal">· {sprintLabel(sprint)}</span>
        </span>
        <button onClick={close} className="rounded-md p-1.5 text-ink3 transition-colors hover:bg-ink/5 hover:text-ink" title="Close">
          <IconX size={16} />
        </button>
      </div>

      {/* progress dots */}
      <div className="flex shrink-0 items-center justify-center gap-1.5 pb-6 pt-2">
        {steps.map((s, i) => (
          <button
            key={s}
            onClick={() => i < step && !finished && setStep(i)}
            className="group flex items-center gap-1.5"
            disabled={i >= step || !!finished}
            title={STEP_TITLES[i] ?? s}
          >
            <span
              className={cn(
                "h-[7px] rounded-full transition-all duration-200",
                i === step ? "w-6 bg-accent" : i < step ? "w-[7px] bg-accent/60" : "w-[7px] bg-bord2",
              )}
            />
          </button>
        ))}
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-4">
        <div className="mx-auto max-w-[640px]">
          <h1 className="mb-5 text-[20px] font-semibold tracking-[-0.01em] text-ink">
            {current === "recap" && "Sprint recap"}
            {current === "stale" && "Stale task triage"}
            {current === "goals" && "Goal check-in"}
            {current === "reflection" && "Reflection"}
            {current === "plan" && "Plan the next sprint"}
            {current === "done" && (finished !== null ? "All set" : "Close out")}
          </h1>
          {stepBody()}
        </div>
      </div>

      {/* footer nav */}
      {!finished && (
        <div className="flex shrink-0 items-center justify-between border-t border-bord px-8 py-3.5">
          <Button
            variant="ghost"
            icon={<IconChevronLeft size={13} />}
            onClick={() => (step === 0 ? close() : setStep(step - 1))}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <div className="flex items-center gap-2">
            {current === "reflection" && !reflections.trim() && (
              <Button variant="ghost" onClick={() => setStep(step + 1)}>
                Skip
              </Button>
            )}
            {!isLast && (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Continue
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
