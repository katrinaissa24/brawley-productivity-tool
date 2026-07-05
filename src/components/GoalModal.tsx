import { useEffect, useState } from "react";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { addDaysStr, todayStr } from "../lib/util";
import type { DeadlineBehavior, ProgressMode } from "../types";
import { Button, Modal, ModalHeader, Select, TextArea, TextInput } from "./ui/primitives";

const MODE_LABEL: Record<ProgressMode, string> = {
  auto_tasks: "Automatic — % of linked tasks done",
  manual: "Manual — I move the slider",
  milestones: "Milestones — % of checklist done",
};

const BEHAVIOR_LABEL: Record<DeadlineBehavior, string> = {
  ask: "Ask me what to do",
  auto_extend: "Prompt for a new date",
  auto_missed: "Mark as missed",
  auto_archive: "Archive it",
};

export function GoalModal() {
  const modal = useUI((s) => s.goalModal);
  const setModal = useUI((s) => s.setGoalModal);
  const go = useUI((s) => s.go);
  const goals = useData((s) => s.goals);
  const projects = useData((s) => s.projects);
  const addGoal = useData((s) => s.addGoal);
  const updateGoal = useData((s) => s.updateGoal);
  const settings = useSettings((s) => s.settings);

  const editing = modal?.goalId ? goals.find((g) => g.id === modal.goalId) : null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [targetDate, setTargetDate] = useState(addDaysStr(todayStr(), 14));
  const [mode, setMode] = useState<ProgressMode>(settings.goalDefaultProgressMode);
  const [behavior, setBehavior] = useState<DeadlineBehavior>(settings.goalDeadlineBehavior);

  useEffect(() => {
    if (modal) {
      setTitle(editing?.title ?? "");
      setDescription(editing?.description ?? "");
      setProjectId(editing?.projectId ?? modal.projectId ?? "");
      setTargetDate(editing?.targetDate ?? addDaysStr(todayStr(), 14));
      setMode(editing?.progressMode ?? settings.goalDefaultProgressMode);
      setBehavior(editing?.deadlineBehavior ?? settings.goalDeadlineBehavior);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.goalId, modal != null]);

  if (!modal) return null;

  const activeProjects = projects.filter((p) => !p.archivedAt);
  const valid = title.trim().length > 0 && targetDate && projectId;

  const save = () => {
    if (!valid) return;
    if (editing) {
      updateGoal(editing.id, {
        title: title.trim(),
        description: description.trim() || null,
        projectId,
        targetDate,
        progressMode: mode,
        deadlineBehavior: behavior,
      });
    } else {
      const g = addGoal({
        projectId,
        title: title.trim(),
        description: description.trim() || null,
        targetDate,
        progressMode: mode,
        deadlineBehavior: behavior,
      });
      go({ name: "goal", goalId: g.id });
    }
    setModal(null);
  };

  return (
    <Modal open onClose={() => setModal(null)} width={460}>
      <ModalHeader
        title={editing ? "Edit goal" : "New goal"}
        subtitle="Goals are dated — give it a real deadline."
        onClose={() => setModal(null)}
      />
      <div className="flex flex-col gap-3.5 px-4 py-3">
        <TextInput
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={`e.g. "Score 100 on the exam"`}
        />
        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why it matters, definition of done… (optional)"
          rows={2}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink3">Project</span>
            <Select
              value={projectId}
              onChange={setProjectId}
              placeholder="Pick a project"
              options={activeProjects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink3">Target date</span>
            <input
              type="date"
              value={targetDate}
              min={todayStr()}
              onChange={(e) => setTargetDate(e.target.value)}
              className="h-[30px] rounded-lg border border-bord bg-card px-2 text-[13px] text-ink focus:border-accent/60 focus:outline-none"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink3">Progress tracking</span>
          <Select
            value={mode}
            onChange={(v) => setMode(v as ProgressMode)}
            options={(Object.keys(MODE_LABEL) as ProgressMode[]).map((m) => ({
              value: m,
              label: MODE_LABEL[m],
            }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink3">When the deadline passes</span>
          <Select
            value={behavior}
            onChange={(v) => setBehavior(v as DeadlineBehavior)}
            options={(Object.keys(BEHAVIOR_LABEL) as DeadlineBehavior[]).map((b) => ({
              value: b,
              label: BEHAVIOR_LABEL[b],
            }))}
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-bord px-4 py-3">
        <Button variant="ghost" onClick={() => setModal(null)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={!valid}>
          {editing ? "Save" : "Create goal"}
        </Button>
      </div>
    </Modal>
  );
}
