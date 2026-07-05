import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
import { SortableTask } from "../components/dnd";
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

  const { focus, later, done } = useMemo(
    () => todayLists(tasks, projects, settings.todayCap),
    [tasks, projects, settings.todayCap],
  );
  const open = useMemo(() => [...focus, ...later], [focus, later]);
  const openIds = useMemo(() => open.map((t) => t.id), [open]);
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

  const dayCleared = open.length === 0 && done.length > 0;

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
        {open.length === 0 && done.length === 0 && (
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
          <div className="anim-scale mt-6 rounded-xl border border-bord bg-card px-6 py-10 text-center shadow-card">
            <IconCheckCircle size={34} className="mx-auto text-accent" />
            <p className="mt-3 text-[17px] font-semibold text-ink">Day cleared</p>
            <p className="mt-1 text-[13px] text-ink3">
              {plural(done.length, "task")} done
              {doneMinutes > 0 && <> · ~{formatMinutes(doneMinutes)} of estimated work</>}
              . Enjoy the quiet.
            </p>
          </div>
        )}

        <SortableContext items={openIds} strategy={verticalListSortingStrategy}>
          {focus.length > 0 && (
            <div className="flex flex-col gap-2">
              {focus.map((t) => (
                <SortableTask key={t.id} task={t} listIds={openIds}>
                  <TaskCard task={t} showProject />
                </SortableTask>
              ))}
            </div>
          )}

          {later.length > 0 && (
            <div className="mt-5">
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

        {done.length > 0 && !dayCleared && (
          <div className="mt-7">
            <button
              onClick={() => setDoneOpen(!doneOpen)}
              className="flex items-center gap-1.5 mb-2"
            >
              {doneOpen ? <IconChevronDown size={13} className="text-ink3" /> : <IconChevronRight size={13} className="text-ink3" />}
              <SectionLabel>Done · {done.length}</SectionLabel>
            </button>
            {doneOpen && (
              <div className={cn("flex flex-col gap-2")}>
                {done.map((t) => (
                  <TaskCard key={t.id} task={t} showProject dense />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ViewShell>
  );
}
