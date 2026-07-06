import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useData } from "../stores/data";
import { useUI } from "../stores/ui";
import { fuzzyScore } from "../lib/util";
import { ViewShell } from "../components/ViewShell";
import { Button, EmptyState, Segmented, TextInput } from "../components/ui/primitives";
import { IconArchive, IconChevronLeft, IconTrash } from "../components/icons";

type Tab = "tasks" | "projects" | "goals";

function when(iso: string | null): string {
  if (!iso) return "";
  return format(new Date(iso), "MMM d, yyyy");
}

export function ArchiveView() {
  const go = useUI((s) => s.go);
  const ask = useUI((s) => s.ask);
  const data = useData();
  const [tab, setTab] = useState<Tab>("tasks");
  const [q, setQ] = useState("");
  const [taskFilter, setTaskFilter] = useState<"all" | "archived" | "completed">("all");

  const match = (text: string) => !q.trim() || fuzzyScore(q, text) >= 0;

  const tasks = useMemo(() => {
    return data.tasks
      .filter((t) => {
        const archived = !!t.archivedAt;
        const completed = t.status === "done";
        if (!archived && !completed) return false;
        if (taskFilter === "archived" && !archived) return false;
        if (taskFilter === "completed" && !completed) return false;
        return match(t.title);
      })
      .sort((a, b) => {
        const ka = a.archivedAt ?? a.completedAt ?? a.updatedAt;
        const kb = b.archivedAt ?? b.completedAt ?? b.updatedAt;
        return ka < kb ? 1 : -1;
      })
      .slice(0, 200);
  }, [data.tasks, q, taskFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const projects = useMemo(
    () => data.projects.filter((p) => p.archivedAt && match(p.name)),
    [data.projects, q], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const goals = useMemo(
    () => data.goals.filter((g) => g.status !== "active" && match(g.title)),
    [data.goals, q], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <ViewShell
      title={
        <span className="flex items-center gap-2">
          <button
            onClick={() => go({ name: "settings", section: "data" })}
            className="rounded-md p-1 text-ink3 hover:bg-ink/5 hover:text-ink"
            title="Back to Settings"
          >
            <IconChevronLeft size={16} />
          </button>
          Archive & History
        </span>
      }
      meta="Nothing is ever lost — restore anything, or delete it for good"
      actions={
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "tasks", label: "Tasks" },
            { value: "projects", label: "Projects" },
            { value: "goals", label: "Goals" },
          ]}
        />
      }
    >
      <div className="max-w-[680px]">
        <div className="flex items-center gap-2">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="max-w-[280px]" />
          {tab === "tasks" && (
            <Segmented
              value={taskFilter}
              onChange={setTaskFilter}
              options={[
                { value: "all", label: "All" },
                { value: "archived", label: "Archived" },
                { value: "completed", label: "Completed" },
              ]}
            />
          )}
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          {tab === "tasks" &&
            (tasks.length === 0 ? (
              <EmptyState icon={<IconArchive size={26} />} title="Nothing here" hint="Archived and completed tasks will show up here." />
            ) : (
              tasks.map((t) => {
                const project = t.projectId ? data.projects.find((p) => p.id === t.projectId) : null;
                return (
                  <div key={t.id} className="group flex items-center gap-3 rounded-xl border border-bord bg-card px-3.5 py-2.5 shadow-card">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-ink">{t.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink3">
                        {project && (
                          <>
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: project.color }} />
                            {project.name} ·
                          </>
                        )}
                        {t.archivedAt ? `Archived ${when(t.archivedAt)}` : `Completed ${when(t.completedAt)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="xs"
                        onClick={() => {
                          if (t.archivedAt) data.restoreTask(t.id);
                          else data.updateTask(t.id, { status: "todo" });
                        }}
                      >
                        {t.archivedAt ? "Restore" : "Reopen"}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={<IconTrash size={12} />}
                        onClick={() =>
                          ask({
                            title: "Delete permanently?",
                            message: `"${t.title}" will be gone for good.`,
                            confirmLabel: "Delete",
                            danger: true,
                            onConfirm: () => data.deleteTaskHard(t.id),
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })
            ))}

          {tab === "projects" &&
            (projects.length === 0 ? (
              <EmptyState icon={<IconArchive size={26} />} title="No archived projects" />
            ) : (
              projects.map((p) => (
                <div key={p.id} className="group flex items-center gap-3 rounded-xl border border-bord bg-card px-3.5 py-2.5 shadow-card">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-ink">{p.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink3">
                      Archived {when(p.archivedAt)} · {data.tasks.filter((t) => t.projectId === p.id).length} tasks preserved
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="xs" onClick={() => data.restoreProject(p.id)}>
                      Restore
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={<IconTrash size={12} />}
                      onClick={() =>
                        ask({
                          title: "Delete project permanently?",
                          message: `"${p.name}" and ALL of its tasks and goals will be gone for good. Restoring instead keeps everything.`,
                          confirmLabel: "Delete everything",
                          danger: true,
                          onConfirm: () => data.deleteProjectHard(p.id),
                        })
                      }
                    />
                  </div>
                </div>
              ))
            ))}

          {tab === "goals" &&
            (goals.length === 0 ? (
              <EmptyState icon={<IconArchive size={26} />} title="No past goals" hint="Completed, missed, and archived goals end up here." />
            ) : (
              goals.map((g) => (
                <div key={g.id} className="group flex items-center gap-3 rounded-xl border border-bord bg-card px-3.5 py-2.5 shadow-card">
                  <span
                    className={
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold " +
                      (g.status === "completed"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : g.status === "missed"
                          ? "bg-red-500/15 text-red-600 dark:text-red-400"
                          : "bg-zinc-500/15 text-ink3")
                    }
                  >
                    {g.status === "completed" ? "Completed" : g.status === "missed" ? "Missed" : "Archived"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => go({ name: "goal", goalId: g.id })} className="block max-w-full truncate text-left text-[13.5px] text-ink hover:text-accent transition-colors">
                      {g.title}
                    </button>
                    <p className="mt-0.5 text-[11.5px] text-ink3">Target was {when(g.targetDate + "T00:00:00")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="xs" onClick={() => data.setGoalStatus(g.id, "active")}>
                      Reactivate
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={<IconTrash size={12} />}
                      onClick={() =>
                        ask({
                          title: "Delete goal permanently?",
                          message: "Linked tasks are kept and unlinked.",
                          confirmLabel: "Delete",
                          danger: true,
                          onConfirm: () => data.deleteGoalHard(g.id),
                        })
                      }
                    />
                  </div>
                </div>
              ))
            ))}
        </div>
      </div>
    </ViewShell>
  );
}
