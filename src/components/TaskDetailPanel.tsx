import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { marked } from "marked";
import type { Recurrence, TaskStatus } from "../types";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { activeSprint, STATUS_LABEL, statusColumns } from "../stores/selectors";
import {
  cn,
  DOW_SHORT,
  formatMinutes,
  localDateOf,
  parseEstimate,
  relativeDayLabel,
  todayStr,
} from "../lib/util";
import { parseRecurrence, serializeRecurrence } from "../lib/recurrence";
import {
  IconArchive,
  IconCheck,
  IconEye,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
  IconZap,
} from "./icons";
import { Button, Segmented, Select, TextInput } from "./ui/primitives";

marked.setOptions({ gfm: true, breaks: true });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-h-[34px]">
      <span className="w-[88px] shrink-0 text-[12.5px] text-ink3">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function DateField({
  value,
  onChange,
  quickToday,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  quickToday?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-[28px] rounded-lg border border-bord bg-card px-2 text-[12.5px] text-ink focus:border-accent/60 focus:outline-none"
      />
      {quickToday && value !== todayStr() && (
        <button
          onClick={() => onChange(todayStr())}
          className="text-[11.5px] text-accent hover:underline"
        >
          Today
        </button>
      )}
      {value && (
        <button onClick={() => onChange(null)} className="text-ink3 hover:text-ink p-0.5" title="Clear">
          <IconX size={12} />
        </button>
      )}
    </div>
  );
}

function EstimateField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value != null ? formatMinutes(value) : "");
  useEffect(() => setText(value != null ? formatMinutes(value) : ""), [value]);
  return (
    <TextInput
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const trimmed = text.trim();
        if (!trimmed) return onChange(null);
        const parsed = parseEstimate(trimmed);
        if (parsed != null && parsed > 0) onChange(parsed);
        else setText(value != null ? formatMinutes(value) : "");
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      placeholder="e.g. 45m, 1h 30m"
      className="h-[28px] w-[130px]"
    />
  );
}

function RecurrenceEditor({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const rec = parseRecurrence(value);
  const freq = rec?.freq ?? "never";

  const setFreq = (f: string) => {
    if (f === "never") return onChange(null);
    const next: Recurrence =
      f === "weekly"
        ? { freq: "weekly", days: [new Date().getDay()] }
        : f === "every_n_days"
          ? { freq: "every_n_days", n: 2 }
          : { freq: f as Recurrence["freq"] };
    onChange(serializeRecurrence(next));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={freq}
        onChange={setFreq}
        className="h-[28px] w-[150px]"
        options={[
          { value: "never", label: "Never" },
          { value: "daily", label: "Daily" },
          { value: "weekdays", label: "Weekdays" },
          { value: "weekly", label: "Weekly" },
          { value: "every_n_days", label: "Every N days" },
          { value: "monthly", label: "Monthly" },
        ]}
      />
      {rec?.freq === "weekly" && (
        <div className="flex gap-1">
          {DOW_SHORT.map((d, i) => {
            const on = rec.days?.includes(i) ?? false;
            return (
              <button
                key={d}
                onClick={() => {
                  const days = new Set(rec.days ?? []);
                  if (on) days.delete(i);
                  else days.add(i);
                  if (days.size === 0) days.add(i);
                  onChange(serializeRecurrence({ ...rec, days: [...days].sort() }));
                }}
                className={cn(
                  "h-6 w-8 rounded-md text-[11px] font-medium transition-colors",
                  on ? "bg-accent text-white" : "bg-panel text-ink3 hover:text-ink2 border border-bord",
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
      {rec?.freq === "every_n_days" && (
        <div className="flex items-center gap-2 text-[12.5px] text-ink3">
          Every
          <TextInput
            type="number"
            min={1}
            value={String(rec.n ?? 2)}
            onChange={(e) =>
              onChange(
                serializeRecurrence({ ...rec, n: Math.max(1, parseInt(e.target.value || "2", 10)) }),
              )
            }
            className="h-[26px] w-[56px]"
          />
          days
        </div>
      )}
    </div>
  );
}

export function TaskDetailPanel() {
  const detailTaskId = useUI((s) => s.detailTaskId);
  const openDetail = useUI((s) => s.openDetail);
  const toast = useUI((s) => s.toast);
  const ask = useUI((s) => s.ask);

  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const goals = useData((s) => s.goals);
  const subtasks = useData((s) => s.subtasks);
  const sprints = useData((s) => s.sprints);
  const updateTask = useData((s) => s.updateTask);
  const trySetStatus = useData((s) => s.trySetStatus);
  const completeTask = useData((s) => s.completeTask);
  const archiveTask = useData((s) => s.archiveTask);
  const deleteTaskHard = useData((s) => s.deleteTaskHard);
  const addSubtask = useData((s) => s.addSubtask);
  const updateSubtask = useData((s) => s.updateSubtask);
  const deleteSubtask = useData((s) => s.deleteSubtask);
  const commitToSprint = useData((s) => s.commitToSprint);
  const removeFromSprint = useData((s) => s.removeFromSprint);

  const settings = useSettings((s) => s.settings);

  const task = tasks.find((t) => t.id === detailTaskId) ?? null;
  const subs = useMemo(
    () => subtasks.filter((st) => st.taskId === task?.id).sort((a, b) => a.sortOrder - b.sortOrder),
    [subtasks, task?.id],
  );

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(false);
  const [newSub, setNewSub] = useState("");
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setPreview(false);
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [title, task?.id]);

  if (!task) return null;

  const close = () => openDetail(null);
  const commitTitle = () => {
    const v = title.trim();
    if (v && v !== task.title) updateTask(task.id, { title: v });
    else setTitle(task.title);
  };
  const commitNotes = () => {
    const v = notes.trim();
    updateTask(task.id, { notes: v || null });
  };

  const projectGoals = goals.filter(
    (g) => g.projectId === task.projectId && g.status === "active",
  );
  const sprint = activeSprint(sprints);
  const statuses = statusColumns(settings.blockedEnabled);
  const allSubsDone = subs.length > 0 && subs.every((st) => st.done);
  const done = task.status === "done";

  const setStatus = (status: TaskStatus) => {
    const r = trySetStatus(task.id, status);
    if (!r.ok && r.msg) toast(r.msg, "error");
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onMouseDown={close} />
      <div className="anim-slide-right fixed right-0 top-0 z-40 flex h-full w-[440px] max-w-[90vw] flex-col border-l border-bord bg-card shadow-pop">
        {/* header */}
        <div className="flex items-center justify-between border-b border-bord px-4 py-2.5 shrink-0">
          <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink3">
            {task.projectId
              ? projects.find((p) => p.id === task.projectId)?.name ?? "Task"
              : "Inbox"}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                archiveTask(task.id);
                close();
              }}
              title="Archive"
              className="rounded-md p-1.5 text-ink3 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <IconArchive size={14} />
            </button>
            <button
              onClick={() =>
                ask({
                  title: "Delete task?",
                  message: `"${task.title}" will be permanently deleted.`,
                  confirmLabel: "Delete",
                  danger: true,
                  onConfirm: () => {
                    deleteTaskHard(task.id);
                    close();
                  },
                })
              }
              title="Delete"
              className="rounded-md p-1.5 text-ink3 transition-colors hover:bg-red-500/10 hover:text-red-500"
            >
              <IconTrash size={14} />
            </button>
            <button
              onClick={close}
              title="Close (Esc)"
              className="rounded-md p-1.5 text-ink3 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <IconX size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* title */}
          <textarea
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent text-[17px] font-semibold leading-snug text-ink outline-none placeholder:text-ink3",
              done && "line-through text-ink3",
            )}
            placeholder="Task title"
          />

          {allSubsDone && !done && (
            <div className="anim-fade mt-2 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/8 bg-accent/5 px-3 py-2">
              <span className="text-[12.5px] text-ink2">All subtasks done — mark task done?</span>
              <Button size="xs" variant="primary" onClick={() => completeTask(task.id)}>
                Complete
              </Button>
            </div>
          )}

          {/* fields */}
          <div className="mt-4 flex flex-col gap-0.5">
            <FieldRow label="Status">
              <Segmented
                value={task.status}
                onChange={(v) => setStatus(v as TaskStatus)}
                options={statuses.map((st) => ({ value: st, label: STATUS_LABEL[st] }))}
              />
            </FieldRow>
            <FieldRow label="Priority">
              <Segmented
                value={task.priority ?? "none"}
                onChange={(v) => updateTask(task.id, { priority: v === "none" ? null : (v as "P1") })}
                options={[
                  { value: "P1", label: "P1" },
                  { value: "P2", label: "P2" },
                  { value: "P3", label: "P3" },
                  { value: "none", label: "—" },
                ]}
              />
            </FieldRow>
            <FieldRow label="Project">
              <Select
                value={task.projectId ?? ""}
                onChange={(v) =>
                  updateTask(task.id, { projectId: v || null, ...(v ? {} : { goalId: null }) })
                }
                placeholder="Inbox"
                className="h-[28px] max-w-[220px]"
                options={projects
                  .filter((p) => !p.archivedAt)
                  .map((p) => ({ value: p.id, label: p.name }))}
              />
            </FieldRow>
            <FieldRow label="Goal">
              {task.projectId && projectGoals.length > 0 ? (
                <Select
                  value={task.goalId ?? ""}
                  onChange={(v) => updateTask(task.id, { goalId: v || null })}
                  placeholder="None"
                  className="h-[28px] max-w-[220px]"
                  options={projectGoals.map((g) => ({ value: g.id, label: g.title }))}
                />
              ) : (
                <span className="text-[12.5px] text-ink3">
                  {task.projectId ? "No goals in this project yet" : "Assign a project first"}
                </span>
              )}
            </FieldRow>
            <FieldRow label="Do date">
              <DateField value={task.doDate} onChange={(v) => updateTask(task.id, { doDate: v })} quickToday />
            </FieldRow>
            <FieldRow label="Due date">
              <DateField value={task.dueDate} onChange={(v) => updateTask(task.id, { dueDate: v })} />
            </FieldRow>
            <FieldRow label="Estimate">
              <EstimateField
                value={task.estimateMinutes}
                onChange={(v) => updateTask(task.id, { estimateMinutes: v })}
              />
            </FieldRow>
            <FieldRow label="Repeat">
              <RecurrenceEditor
                value={task.recurrence}
                onChange={(v) => updateTask(task.id, { recurrence: v })}
              />
            </FieldRow>
            <FieldRow label="Sprint">
              {sprint ? (
                task.sprintId === sprint.id ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-1.5 py-0.5 text-[11.5px] font-medium text-accent">
                      <IconZap size={11} /> In current sprint
                    </span>
                    <button
                      onClick={() => removeFromSprint(task.id)}
                      className="text-[11.5px] text-ink3 hover:text-ink underline-offset-2 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <Button size="xs" variant="secondary" icon={<IconZap size={11} />} onClick={() => commitToSprint(task.id, sprint.id)}>
                    Add to sprint
                  </Button>
                )
              ) : (
                <span className="text-[12.5px] text-ink3">No active sprint</span>
              )}
            </FieldRow>
          </div>

          {/* subtasks */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-ink3">
                Subtasks {subs.length > 0 && `· ${subs.filter((s) => s.done).length}/${subs.length}`}
              </span>
            </div>
            <div className="flex flex-col">
              {subs.map((st) => (
                <div key={st.id} className="group flex items-center gap-2.5 rounded-md px-1 py-[5px] hover:bg-panel/70">
                  <button
                    onClick={() => updateSubtask(st.id, { done: !st.done })}
                    className={cn(
                      "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4.5px] border-[1.5px] transition-colors",
                      st.done ? "border-accent bg-accent text-white" : "border-bord2 hover:border-accent",
                    )}
                  >
                    {st.done && <IconCheck size={9} strokeWidth={3} />}
                  </button>
                  <span className={cn("flex-1 text-[13px] text-ink", st.done && "line-through text-ink3")}>
                    {st.title}
                  </span>
                  <button
                    onClick={() => deleteSubtask(st.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100 text-ink3 hover:text-red-500 p-0.5"
                  >
                    <IconX size={12} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2.5 px-1 py-1">
                <IconPlus size={13} className="shrink-0 text-ink3" />
                <input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSub.trim()) {
                      addSubtask(task.id, newSub);
                      setNewSub("");
                    }
                  }}
                  placeholder="Add subtask"
                  className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink3"
                />
              </div>
            </div>
          </div>

          {/* notes */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-ink3">Notes</span>
              {(notes || task.notes) && (
                <button
                  onClick={() => {
                    if (!preview) commitNotes();
                    setPreview(!preview);
                  }}
                  className="flex items-center gap-1 text-[11.5px] text-ink3 hover:text-ink2"
                  title={preview ? "Edit" : "Preview markdown"}
                >
                  {preview ? <IconPencil size={12} /> : <IconEye size={12} />}
                  {preview ? "Edit" : "Preview"}
                </button>
              )}
            </div>
            {preview ? (
              <div
                className="md-body min-h-[60px] rounded-lg border border-bord bg-panel/50 px-3 py-2"
                dangerouslySetInnerHTML={{ __html: marked.parse(notes || "") as string }}
              />
            ) : (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={commitNotes}
                placeholder="Add notes… (markdown supported)"
                rows={4}
                className="w-full resize-y rounded-lg border border-bord bg-card px-3 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink3 focus:border-accent/60 focus:ring-2 focus:ring-accent/15 selectable"
              />
            )}
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-bord px-4 py-3 shrink-0">
          <span className="text-[11px] text-ink3">
            {done && task.completedAt
              ? `Completed ${relativeDayLabel(localDateOf(task.completedAt))}`
              : `Created ${relativeDayLabel(localDateOf(task.createdAt))}`}
          </span>
          {done ? (
            <Button variant="secondary" onClick={() => updateTask(task.id, { status: "todo" })}>
              Reopen
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<IconCheck size={13} />}
              onClick={() => {
                completeTask(task.id);
              }}
            >
              Complete
            </Button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
