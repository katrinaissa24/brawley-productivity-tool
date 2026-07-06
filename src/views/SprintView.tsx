import { useMemo, useState } from "react";
import { SortableContext } from "@dnd-kit/sortable";
import { noSortingStrategy } from "../lib/collision";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import {
  activeProjects,
  activeSprint,
  backlogTasks,
  isOpen,
  reviewDue,
  sprintDaysLeft,
  sprintLabel,
  sprintTasks,
  workloadMinutes,
} from "../stores/selectors";
import { cn, formatMinutes, plural } from "../lib/util";
import { DroppableZone, SortableTask } from "../components/dnd";
import { TaskBoard } from "../components/TaskBoard";
import { TaskCard } from "../components/TaskCard";
import { ViewShell } from "../components/ViewShell";
import { Doughnut } from "../components/charts";
import { Button, EmptyState, Select } from "../components/ui/primitives";
import {
  IconChevronRight,
  IconCheckCircle,
  IconPlus,
  IconZap,
} from "../components/icons";

export function SprintView() {
  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const sprints = useData((s) => s.sprints);
  const commitToSprint = useData((s) => s.commitToSprint);
  const addTask = useData((s) => s.addTask);
  const settings = useSettings((s) => s.settings);
  const go = useUI((s) => s.go);
  const setReviewOpen = useUI((s) => s.setReviewOpen);
  const backlogOpen = useUI((s) => s.backlogOpen);
  const setBacklogOpen = useUI((s) => s.setBacklogOpen);

  const [backlogProject, setBacklogProject] = useState("");
  const [backlogPriority, setBacklogPriority] = useState("");

  const sprint = activeSprint(sprints);
  const committed = useMemo(
    () => (sprint ? sprintTasks(tasks, projects, sprint.id) : []),
    [tasks, projects, sprint],
  );
  const draggingIds = useUI((s) => s.draggingIds);
  const backlog = useMemo(() => {
    if (!sprint) return [];
    return backlogTasks(tasks, projects, sprint.id).filter((t) => {
      if (backlogProject && t.projectId !== backlogProject) return false;
      if (backlogPriority && t.priority !== backlogPriority) return false;
      return true;
    });
  }, [tasks, projects, sprint, backlogProject, backlogPriority]);

  if (!sprint) {
    return (
      <ViewShell title="Sprint">
        <EmptyState icon={<IconZap size={28} />} title="No active sprint" hint="A sprint is created automatically — try restarting the app." />
      </ViewShell>
    );
  }

  const done = committed.filter((t) => t.status === "done");
  const open = committed.filter(isOpen);
  const daysLeft = sprintDaysLeft(sprint);
  const due = reviewDue(sprint);
  const committedMinutes = workloadMinutes(committed.filter((t) => !t.archivedAt));
  const backlogIds = backlog
    .filter((t) => !draggingIds.includes(t.id))
    .map((t) => t.id);

  return (
    <ViewShell
      title={`Sprint · ${sprintLabel(sprint)}`}
      meta={
        <>
          {due ? (
            <span className="font-medium text-orange-500">Ended — ready for review</span>
          ) : (
            <>{daysLeft === 1 ? "Last day" : `${daysLeft} days left`}</>
          )}
          {" · "}
          {done.length}/{committed.length} done
          {committedMinutes > 0 && <> · ~{formatMinutes(committedMinutes)} committed</>}
        </>
      }
      actions={
        <>
          <Doughnut done={done.length} total={committed.length} size={44} thickness={6} />
          <Button
            variant={due ? "primary" : "secondary"}
            icon={<IconCheckCircle size={13} />}
            onClick={() => {
              go({ name: "review" });
              setReviewOpen(true);
            }}
          >
            {due ? "Start review" : "Review early"}
          </Button>
        </>
      }
      padContent={false}
      contentClassName="flex flex-col"
    >
      {due && (
        <div className="mx-8 mb-3 flex shrink-0 items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 anim-fade">
          <span className="text-[13px] text-ink">
            The sprint ended — run your weekly review to close it and plan the next one.
          </span>
          <Button
            size="xs"
            variant="primary"
            onClick={() => {
              go({ name: "review" });
              setReviewOpen(true);
            }}
          >
            Start review
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-0 px-8 pb-8">
        <div className="min-w-0 flex-1">
          <TaskBoard
            tasks={committed}
            sprintId={sprint.id}
            showProject
            onQuickAdd={(title) =>
              addTask({ title, sprintId: sprint.id, priority: settings.defaultPriority })
            }
          />
          {committed.length === 0 && (
            <p className="mt-3 text-center text-[12.5px] text-ink3">
              Nothing committed yet — drag tasks in from the backlog on the right, or add one above.
            </p>
          )}
        </div>

        {/* Backlog panel */}
        <div className={cn("flex shrink-0 flex-col transition-all", backlogOpen ? "w-[300px] ml-4" : "w-[30px] ml-2")}>
          <button
            onClick={() => setBacklogOpen(!backlogOpen)}
            className="mb-2 flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wider text-ink3 hover:text-ink2"
            title={backlogOpen ? "Collapse backlog" : "Open backlog"}
          >
            <IconChevronRight
              size={13}
              className={cn("transition-transform", backlogOpen && "rotate-90")}
            />
            {backlogOpen && <>Backlog · {backlog.length}</>}
          </button>
          {backlogOpen && (
            <DroppableZone
              id="backlog"
              data={{ type: "backlog" }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {(isOver) => (
                <div
                  className={cn(
                    "flex min-h-0 flex-1 flex-col rounded-xl border bg-panel/50 transition-all",
                    isOver ? "border-accent/50 ring-2 ring-accent/20" : "border-bord/70",
                  )}
                >
                  <div className="flex gap-1.5 p-2">
                    <Select
                      value={backlogProject}
                      onChange={setBacklogProject}
                      placeholder="All projects"
                      className="h-[26px] flex-1 text-[12px]"
                      options={activeProjects(projects).map((p) => ({ value: p.id, label: p.name }))}
                    />
                    <Select
                      value={backlogPriority}
                      onChange={setBacklogPriority}
                      placeholder="Any"
                      className="h-[26px] w-[88px] text-[12px]"
                      options={[
                        { value: "P1", label: "High" },
                        { value: "P2", label: "Medium" },
                        { value: "P3", label: "Low" },
                      ]}
                    />
                  </div>
                  <SortableContext items={backlogIds} strategy={noSortingStrategy}>
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 pt-0">
                      {backlog.length === 0 && (
                        <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-ink3">
                          Backlog clear — every open task is either in the sprint or filtered out.
                        </p>
                      )}
                      {backlog.map((t) => (
                        <SortableTask key={t.id} task={t} listIds={backlogIds}>
                          <div className="group/bk relative">
                            <TaskCard task={t} showProject dense />
                            <button
                              title="Add to sprint"
                              onClick={(e) => {
                                e.stopPropagation();
                                commitToSprint(t.id, sprint.id);
                              }}
                              className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-accent text-white shadow-cardHover group-hover/bk:flex"
                            >
                              <IconPlus size={11} strokeWidth={2.4} />
                            </button>
                          </div>
                        </SortableTask>
                      ))}
                    </div>
                  </SortableContext>
                </div>
              )}
            </DroppableZone>
          )}
        </div>
      </div>
    </ViewShell>
  );
}
