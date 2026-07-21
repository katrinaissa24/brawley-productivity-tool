import { useMemo, useState } from "react";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { inboxTasks } from "../stores/selectors";
import { cn, PROJECT_COLORS } from "../lib/util";
import { Button, Modal, TextInput } from "./ui/primitives";
import { IconArrowRight, IconCheck, IconInbox, IconSparkle } from "./icons";

/**
 * Three-step first-run flow: create a project → capture a note → file it.
 * Appears only on a truly empty database (§11).
 */
export function Onboarding() {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const loaded = useData((s) => s.loaded);
  const projects = useData((s) => s.projects);
  const tasks = useData((s) => s.tasks);
  const addProject = useData((s) => s.addProject);
  const addTask = useData((s) => s.addTask);
  const updateTask = useData((s) => s.updateTask);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);

  const shouldShow = useMemo(
    () => loaded && !settings.onboardingDone && projects.length === 0 && tasks.length === 0,
    [loaded, settings.onboardingDone, projects.length, tasks.length],
  );
  // Once the flow has begun (we created data), keep it open until finished/skipped.
  const active = shouldShow || (step > 0 && !settings.onboardingDone);

  if (!active) return null;

  const finish = () => patch({ onboardingDone: true });

  const createProject = () => {
    if (!name.trim()) return;
    const p = addProject({ name: name.trim(), color });
    setProjectId(p.id);
    setStep(1);
  };

  const captureNote = () => {
    if (!note.trim()) return;
    const t = addTask({ title: note.trim() });
    setNoteId(t.id);
    setStep(2);
  };

  const fileIt = () => {
    if (noteId && projectId) updateTask(noteId, { projectId });
    finish();
  };

  const project = projects.find((p) => p.id === projectId);
  const stillInInbox = noteId ? inboxTasks(tasks).some((t) => t.id === noteId) : true;

  return (
    <Modal open onClose={() => {}} width={480} closeOnBackdrop={false}>
      <div className="px-6 pb-5 pt-6">
        <div className="mb-5 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "h-[6px] rounded-full transition-all duration-200",
                i === step ? "w-5 bg-accent" : i < step ? "w-[6px] bg-accent/60" : "w-[6px] bg-bord2",
              )}
            />
          ))}
          <button onClick={finish} className="ml-auto text-[11.5px] text-ink3 hover:text-ink2">
            Skip intro
          </button>
        </div>

        {step === 0 && (
          <div className="anim-fade">
            <IconSparkle size={24} className="text-accent" />
            <h2 className="mt-2.5 text-[18px] font-semibold text-ink">Welcome to Brawley</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink2">
              Everything lives in projects — work, learning, personal growth. Create your first
              one.
            </p>
            <TextInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              placeholder={`e.g. "Startup", "University", "Health"`}
              className="mt-4 h-[36px] text-[14px]"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PROJECT_COLORS.slice(0, 8).map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-[22px] w-[22px] rounded-full transition-transform hover:scale-110",
                    color === c && "ring-2 ring-accent ring-offset-2 ring-offset-pop scale-110",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
            <Button variant="primary" className="mt-5 w-full" size="md" disabled={!name.trim()} onClick={createProject}>
              Create project
              <IconArrowRight size={14} />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="anim-fade">
            <IconInbox size={24} className="text-accent" />
            <h2 className="mt-2.5 text-[18px] font-semibold text-ink">Get it out of your head</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink2">
              The core habit: anything on your mind goes into the Inbox in under 3 seconds. Try
              it — type one thing you need to do.
            </p>
            <TextInput
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && captureNote()}
              placeholder="What's on your mind?"
              className="mt-4 h-[36px] text-[14px]"
            />
            <Button variant="primary" className="mt-5 w-full" size="md" disabled={!note.trim()} onClick={captureNote}>
              Capture it
              <IconArrowRight size={14} />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="anim-fade">
            <IconCheck size={24} className="text-accent" />
            <h2 className="mt-2.5 text-[18px] font-semibold text-ink">Now file it</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink2">
              Notes become tasks when you drag them onto a project in the sidebar. You can do that
              anytime — or file this one right now.
            </p>
            <div className="mt-4 rounded-xl border border-bord bg-panel/60 px-3.5 py-3">
              <p className="truncate text-[13.5px] text-ink">{note}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink3">
                <IconArrowRight size={11} />
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: project?.color }} />
                {project?.name}
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" size="md" onClick={finish}>
                {stillInInbox ? "I'll drag it myself" : "Done"}
              </Button>
              {stillInInbox && (
                <Button variant="primary" className="flex-1" size="md" onClick={fileIt}>
                  File it now
                </Button>
              )}
            </div>
            <p className="mt-4 text-center text-[11.5px] text-ink3">
              Tip: ⌘⇧Space captures from anywhere in macOS — even when Brawley is in the background.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
