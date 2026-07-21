import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { SortableContext } from "@dnd-kit/sortable";
import { noSortingStrategy } from "../lib/collision";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import {
  activeSprint,
  planCandidates,
  todayLists,
  workloadMinutes,
} from "../stores/selectors";
import { cn, formatMinutes, plural, todayStr } from "../lib/util";
import { DroppableColumn, SortableTask } from "../components/dnd";
import { TaskCard } from "../components/TaskCard";
import { ViewShell } from "../components/ViewShell";
import { Button, EmptyState, SectionLabel } from "../components/ui/primitives";
import { IconCheckCircle, IconChevronDown, IconChevronRight, IconSparkle, IconSun } from "../components/icons";

export function TodayView() {
  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const sprints = useData((s) => s.sprints);
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const setPlanDayOpen = useUI((s) => s.setPlanDayOpen);
  const [laterOpen, setLaterOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(true);

  const draggingIds = useUI((s) => s.draggingIds);
  const { focus, later, doLater, done } = useMemo(
    () => todayLists(tasks, projects, settings.todayCap),
    [tasks, projects, settings.todayCap],
  );
  const open = useMemo(() => [...focus, ...later], [focus, later]);
  const openIds = useMemo(
    () => open.filter((t) => !draggingIds.includes(t.id)).map((t) => t.id),
    [open, draggingIds],
  );
  const workload = workloadMinutes(open);
  const doneMinutes = workloadMinutes(done);

  // "Plan my day" morning flow — once per day on first open.
  useEffect(() => {
    const today = todayStr();
    if (!settings.planMyDayEnabled) return;
    if (settings.lastPlanDate === today) return;
    patch({ lastPlanDate: today });
    const sprint = activeSprint(sprints);
    if (planCandidates(tasks, projects, sprint?.id ?? null).length > 0) {
      setPlanDayOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayCleared = open.length === 0 && doLater.length === 0 && done.length > 0;

  return (
    <ViewShell
      title="Today"
      meta={
        <span>
          {format(new Date(), "EEEE, MMM d")}
          {open.length > 0 && (
            <>
              {" · "}
              {plural(open.length, "task")}
              {workload > 0 && <> · ~{formatMinutes(workload)}</>}
            </>
          )}
        </span>
      }
      actions={
        <Button
          variant="secondary"
          icon={<IconSparkle size={13} />}
          onClick={() => setPlanDayOpen(true)}
        >
          Plan my day
        </Button>
      }
    >
      <div className="max-w-[660px]">
        {open.length === 0 && doLater.length === 0 && done.length === 0 && (
          <EmptyState
            icon={<IconSun size={30} />}
            title="Nothing planned for today"
            hint="Pick a handful of tasks that matter — keeping the list short is the point."
            action={
              <Button variant="primary" icon={<IconSparkle size={13} />} onClick={() => setPlanDayOpen(true)}>
                Plan my day
              </Button>
            }
          />
        )}

        {dayCleared && (
          <div className="anim-scale mb-6 rounded-xl border border-bord bg-card px-6 py-8 text-center shadow-card">
            <IconCheckCircle size={34} className="mx-auto text-accent" />
            <p className="mt-3 text-[17px] font-semibold text-ink">Day cleared</p>
            <p className="mt-1 text-[13px] text-ink3">
              {plural(done.length, "task")} done
              {doneMinutes > 0 && <> · ~{formatMinutes(doneMinutes)} of estimated work</>}
              . Enjoy the quiet.
            </p>
          </div>
        )}

        {(open.length > 0 || doLater.length > 0 || done.length > 0) && (
          <>
            <SortableContext items={openIds} strategy={noSortingStrategy}>
              {(() => {
                const notStarted = focus.filter((t) => t.status !== "in_progress");
                const inProgress = focus.filter((t) => t.status === "in_progress");
                const section = (
                  label: string,
                  status: "todo" | "in_progress",
                  list: typeof focus,
                  emptyHint: string,
                ) => (
                  <DroppableColumn
                    key={status}
                    id={`today:${status}`}
                    status={status}
                    sprintId={null}
                    resetRollover
                    listIds={list.map((t) => t.id)}
                  >
                    {(isOver) => (
                      <div
                        className={cn(
                          "mb-5 rounded-xl p-1 -m-1 transition-all duration-150",
                          isOver && "ring-2 ring-accent/40 bg-accent/[0.04]",
                        )}
                      >
                        <SectionLabel className="mb-2">
                          {label} · {list.length}
                        </SectionLabel>
                        {list.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {list.map((t) => (
                              <SortableTask key={t.id} task={t} listIds={openIds}>
                                <TaskCard task={t} showProject />
                              </SortableTask>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-bord2/70 px-4 py-3.5 text-[12.5px] text-ink3">
                            {emptyHint}
                          </div>
                        )}
                      </div>
                    )}
                  </DroppableColumn>
                );
                return (
                  <>
                    {section("Not started", "todo", notStarted, "Nothing waiting — drag a task here to queue it.")}
                    {section("In progress", "in_progress", inProgress, "Drag a task here to start working on it.")}
                  </>
                );
              })()}

              {doLater.length > 0 && (
                <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
                  <SectionLabel className="mb-0.5 text-amber-600 dark:text-amber-400">
                    Do later · {doLater.length}
                  </SectionLabel>
                  <p className="mb-2 text-[11.5px] text-ink3">
                    Slipped from a previous day — moved forward for you. Start one, or drag it
                    up to commit.
                  </p>
                  <SortableContext
                    items={doLater.filter((t) => !draggingIds.includes(t.id)).map((t) => t.id)}
                    strategy={noSortingStrategy}
                  >
                    <div className="flex flex-col gap-2">
                      {doLater.map((t) => (
                        <SortableTask key={t.id} task={t} listIds={doLater.map((x) => x.id)}>
                          <TaskCard task={t} showProject dense />
                        </SortableTask>
                      ))}
                    </div>
                  </SortableContext>
                </div>
              )}

              {later.length > 0 && (
                <div className="mt-1 mb-5">
                  <button
                    onClick={() => setLaterOpen(!laterOpen)}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink3 hover:text-ink2 transition-colors"
                  >
                    {laterOpen ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                    Later today · {later.length}
                  </button>
                  {laterOpen && (
                    <div className="mt-2 flex flex-col gap-2 opacity-80">
                      {later.map((t) => (
                        <SortableTask key={t.id} task={t} listIds={openIds}>
                          <TaskCard task={t} showProject dense />
                        </SortableTask>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </SortableContext>

            <DroppableColumn id="today:done" status="done" sprintId={null} resetRollover listIds={[]}>
              {(isOver) => (
                <div
                  className={cn(
                    "mt-2 rounded-xl p-1 -m-1 transition-all duration-150",
                    isOver && "ring-2 ring-accent/40 bg-accent/[0.04]",
                  )}
                >
                  <button onClick={() => setDoneOpen(!doneOpen)} className="mb-2 flex items-center gap-1.5">
                    {doneOpen ? (
                      <IconChevronDown size={13} className="text-ink3" />
                    ) : (
                      <IconChevronRight size={13} className="text-ink3" />
                    )}
                    <SectionLabel>Done · {done.length}</SectionLabel>
                  </button>
                  {doneOpen &&
                    (done.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {done.map((t) => (
                          <TaskCard key={t.id} task={t} showProject dense />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-bord2/70 px-4 py-3.5 text-[12.5px] text-ink3">
                        Drag a task here to complete it — today's wins stay visible until midnight.
                      </div>
                    ))}
                </div>
              )}
            </DroppableColumn>
          </>
        )}
      </div>
    </ViewShell>
  );
}
