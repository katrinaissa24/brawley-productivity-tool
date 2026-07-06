import { useEffect, useState, type ReactNode } from "react";
import type { DeadlineBehavior, Priority, ProgressMode, ShortcutMap } from "../types";
import { isTauri } from "../db/driver";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { ACCENT_COLORS, cn, DOW_LABELS } from "../lib/util";
import { comboFromEvent, comboLabel, comboToAccelerator } from "../lib/shortcuts";
import { exportBackup, importBackup, revealDb, syncGlobalShortcut } from "../lib/native";
import { ViewShell } from "../components/ViewShell";
import { Button, SectionLabel, Segmented, Select, TextInput, Toggle } from "../components/ui/primitives";
import {
  IconArchive,
  IconBell,
  IconDatabase,
  IconDownload,
  IconKeyboard,
  IconSettings,
  IconSun,
  IconTarget,
  IconUpload,
  IconZap,
  IconCheckCircle,
  IconEye,
} from "../components/icons";

const SECTIONS = [
  { id: "general", label: "General", icon: <IconSettings size={14} /> },
  { id: "tasks", label: "Tasks", icon: <IconCheckCircle size={14} /> },
  { id: "today", label: "Today", icon: <IconSun size={14} /> },
  { id: "goals", label: "Goals", icon: <IconTarget size={14} /> },
  { id: "review", label: "Review", icon: <IconZap size={14} /> },
  { id: "notifications", label: "Notifications", icon: <IconBell size={14} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <IconKeyboard size={14} /> },
  { id: "data", label: "Data", icon: <IconDatabase size={14} /> },
];

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-[13.5px] text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-[12px] leading-relaxed text-ink3">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <SectionLabel className="mb-2">{title}</SectionLabel>
      <div className="divide-y divide-bord rounded-xl border border-bord bg-card px-4 shadow-card">
        {children}
      </div>
    </section>
  );
}

function NumberField({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <TextInput
        type="number"
        value={String(value)}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value || "0", 10);
          if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="w-[64px] text-center"
      />
      {suffix && <span className="text-[12px] text-ink3">{suffix}</span>}
    </div>
  );
}

const SHORTCUT_ROWS: { key: keyof ShortcutMap; label: string; global?: boolean }[] = [
  { key: "globalCapture", label: "Quick capture (system-wide)", global: true },
  { key: "newTask", label: "New task / focus capture" },
  { key: "commandPalette", label: "Command palette" },
  { key: "settings", label: "Settings" },
  { key: "completeTask", label: "Complete selected task" },
  { key: "editTask", label: "Edit selected task" },
  { key: "goInbox", label: "Go to Inbox" },
  { key: "goToday", label: "Go to Today" },
  { key: "goSprint", label: "Go to Sprint" },
  { key: "goReview", label: "Go to Review" },
  { key: "goInsights", label: "Go to Insights" },
  { key: "goFirstProject", label: "Go to first project" },
];

function ShortcutRecorder({ k }: { k: keyof ShortcutMap }) {
  const settings = useSettings((s) => s.settings);
  const patchShortcut = useSettings((s) => s.patchShortcut);
  const toast = useUI((s) => s.toast);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // modifier only — keep waiting
      const taken = Object.entries(settings.shortcuts).find(
        ([key, v]) => v === combo && key !== k,
      );
      if (taken) {
        toast(`"${comboLabel(combo)}" is already used by another shortcut`, "error");
        setRecording(false);
        return;
      }
      patchShortcut(k, combo);
      if (k === "globalCapture") {
        void syncGlobalShortcut(comboToAccelerator(combo)).catch(() =>
          toast("Couldn't register the global shortcut", "error"),
        );
      }
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [recording, k, settings.shortcuts, patchShortcut, toast]);

  return (
    <button
      onClick={() => setRecording(true)}
      className={cn(
        "min-w-[110px] rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
        recording
          ? "border-accent bg-accent/10 text-accent animate-pulse"
          : "border-bord bg-card text-ink hover:border-bord2",
      )}
    >
      {recording ? "Press keys…" : comboLabel(settings.shortcuts[k])}
    </button>
  );
}

export function SettingsView() {
  const view = useUI((s) => s.view);
  const go = useUI((s) => s.go);
  const ask = useUI((s) => s.ask);
  const toast = useUI((s) => s.toast);
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const insertDemoData = useData((s) => s.insertDemoData);
  const tasksCount = useData((s) => s.tasks.length);

  const section = view.name === "settings" ? (view.section ?? "general") : "general";
  const setSection = (id: string) => go({ name: "settings", section: id });

  return (
    <ViewShell title="Settings" meta="Make Flow yours — every default is changeable">
      <div className="flex gap-8">
        <nav className="w-[170px] shrink-0">
          <div className="flex flex-col gap-0.5 sticky top-0">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors text-left",
                  section === s.id
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-ink2 hover:bg-ink/5 hover:text-ink",
                )}
              >
                <span className={section === s.id ? "text-accent" : "text-ink3"}>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="max-w-[560px] flex-1 min-w-0">
          {section === "general" && (
            <>
              <Card title="Appearance">
                <Row label="Theme" desc="System follows macOS.">
                  <Segmented
                    value={settings.theme}
                    onChange={(v) => patch({ theme: v })}
                    options={[
                      { value: "system", label: "System" },
                      { value: "light", label: "Light" },
                      { value: "dark", label: "Dark" },
                    ]}
                  />
                </Row>
                <Row label="Accent color">
                  <div className="flex gap-1.5">
                    {ACCENT_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        title={c.name}
                        onClick={() => patch({ accentColor: c.hex })}
                        className={cn(
                          "h-[22px] w-[22px] rounded-full transition-transform hover:scale-110",
                          settings.accentColor === c.hex &&
                            "ring-2 ring-offset-2 ring-offset-card ring-accent scale-110",
                        )}
                        style={{ background: c.hex }}
                      />
                    ))}
                  </div>
                </Row>
              </Card>
              <Card title="Sprints">
                <Row label="Duration" desc="Applied when the next sprint is created.">
                  <div className="flex items-center gap-2">
                    <Select
                      value={[7, 14, 21, 28].includes(settings.sprintLengthDays) ? String(settings.sprintLengthDays) : "custom"}
                      onChange={(v) =>
                        patch({ sprintLengthDays: v === "custom" ? 10 : Number(v) })
                      }
                      options={[
                        { value: "7", label: "1 week" },
                        { value: "14", label: "2 weeks" },
                        { value: "21", label: "3 weeks" },
                        { value: "28", label: "4 weeks" },
                        { value: "custom", label: "Custom" },
                      ]}
                    />
                    {![7, 14, 21, 28].includes(settings.sprintLengthDays) && (
                      <NumberField
                        value={settings.sprintLengthDays}
                        onChange={(v) => patch({ sprintLengthDays: v })}
                        min={1}
                        max={60}
                        suffix="days"
                      />
                    )}
                  </div>
                </Row>
                <Row label="Starts on">
                  <Select
                    value={String(settings.sprintStartDow)}
                    onChange={(v) => patch({ sprintStartDow: Number(v) })}
                    options={DOW_LABELS.map((d, i) => ({ value: String(i), label: d }))}
                  />
                </Row>
                <Row
                  label="Ends on"
                  desc="Picking an end day sets a duration within one week."
                >
                  <div className="flex items-center gap-2">
                    <Select
                      value={String((settings.sprintStartDow + settings.sprintLengthDays - 1) % 7)}
                      onChange={(v) =>
                        patch({
                          sprintLengthDays:
                            ((Number(v) - settings.sprintStartDow + 7) % 7) + 1,
                        })
                      }
                      options={DOW_LABELS.map((d, i) => ({ value: String(i), label: d }))}
                    />
                    {settings.sprintLengthDays > 7 && (
                      <span className="text-[11.5px] text-ink3">
                        +{Math.floor((settings.sprintLengthDays - 1) / 7)}w
                      </span>
                    )}
                  </div>
                </Row>
              </Card>
            </>
          )}

          {section === "tasks" && (
            <>
              <Card title="Workflow">
                <Row label="Blocked status" desc={`Adds a "Blocked" column to boards.`}>
                  <Toggle
                    checked={settings.blockedEnabled}
                    onChange={(v) => patch({ blockedEnabled: v })}
                  />
                </Row>
                <Row
                  label="Work-in-progress limit"
                  desc="A gentle blocker when too much is in progress at once."
                >
                  <div className="flex items-center gap-3">
                    <Toggle
                      checked={settings.wipLimitEnabled}
                      onChange={(v) => patch({ wipLimitEnabled: v })}
                    />
                    {settings.wipLimitEnabled && (
                      <NumberField
                        value={settings.wipLimit}
                        onChange={(v) => patch({ wipLimit: v })}
                        min={1}
                        max={10}
                        suffix="tasks"
                      />
                    )}
                  </div>
                </Row>
                <Row label="Default priority for new tasks">
                  <Segmented
                    value={settings.defaultPriority ?? "none"}
                    onChange={(v) =>
                      patch({ defaultPriority: v === "none" ? null : (v as Priority) })
                    }
                    options={[
                      { value: "P1", label: "High" },
                      { value: "P2", label: "Medium" },
                      { value: "P3", label: "Low" },
                      { value: "none", label: "None" },
                    ]}
                  />
                </Row>
              </Card>
              <Card title="Hygiene">
                <Row
                  label="Stale task threshold"
                  desc="Untouched tasks older than this show up in the weekly review triage."
                >
                  <NumberField
                    value={settings.staleDays}
                    onChange={(v) => patch({ staleDays: v })}
                    min={3}
                    max={90}
                    suffix="days"
                  />
                </Row>
                <Row
                  label="Inbox aging indicator"
                  desc="Notes older than this get a subtle nudge."
                >
                  <NumberField
                    value={settings.inboxAgingDays}
                    onChange={(v) => patch({ inboxAgingDays: v })}
                    min={1}
                    max={60}
                    suffix="days"
                  />
                </Row>
                <Row
                  label="Show completed on boards"
                  desc="How long finished tasks stay visible in the Done column."
                >
                  <Select
                    value={String(settings.boardDoneRetentionDays)}
                    onChange={(v) => patch({ boardDoneRetentionDays: Number(v) })}
                    options={[
                      { value: "0", label: "Hide immediately" },
                      { value: "1", label: "1 day" },
                      { value: "3", label: "3 days" },
                      { value: "7", label: "7 days" },
                    ]}
                  />
                </Row>
              </Card>
            </>
          )}

          {section === "today" && (
            <Card title="Focus">
              <Row
                label="Today view cap"
                desc="Hard limit on visible tasks — the rest fold away under “Later today”."
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={3}
                    max={10}
                    value={settings.todayCap}
                    onChange={(e) => patch({ todayCap: Number(e.target.value) })}
                    className="w-[120px] accent-[rgb(var(--c-accent))]"
                  />
                  <span className="w-6 text-center text-[13px] font-semibold tabular-nums text-ink">
                    {settings.todayCap}
                  </span>
                </div>
              </Row>
              <Row
                label={`"Plan my day" prompt`}
                desc="Offer a morning picker the first time you open Today each day."
              >
                <Toggle
                  checked={settings.planMyDayEnabled}
                  onChange={(v) => patch({ planMyDayEnabled: v })}
                />
              </Row>
            </Card>
          )}

          {section === "goals" && (
            <Card title="Defaults">
              <Row label="Progress mode" desc="How new goals measure progress (changeable per goal).">
                <Select
                  value={settings.goalDefaultProgressMode}
                  onChange={(v) => patch({ goalDefaultProgressMode: v as ProgressMode })}
                  options={[
                    { value: "auto_tasks", label: "Linked tasks" },
                    { value: "manual", label: "Manual slider" },
                    { value: "milestones", label: "Milestones" },
                  ]}
                />
              </Row>
              <Row label="When a deadline passes" desc="Default behavior for new goals.">
                <Select
                  value={settings.goalDeadlineBehavior}
                  onChange={(v) => patch({ goalDeadlineBehavior: v as DeadlineBehavior })}
                  options={[
                    { value: "ask", label: "Ask me" },
                    { value: "auto_extend", label: "Prompt for new date" },
                    { value: "auto_missed", label: "Mark missed" },
                    { value: "auto_archive", label: "Archive" },
                  ]}
                />
              </Row>
            </Card>
          )}

          {section === "review" && (
            <Card title="Weekly review">
              <Row
                label="Sprint capacity hint"
                desc="Soft warning while planning the next sprint."
              >
                <NumberField
                  value={settings.sprintCapacityHours}
                  onChange={(v) => patch({ sprintCapacityHours: v })}
                  min={1}
                  max={100}
                  suffix="hours"
                />
              </Row>
              <Row label="Reflection step" desc={`Include the "What worked?" free-writing step.`}>
                <Toggle
                  checked={settings.reflectionEnabled}
                  onChange={(v) => patch({ reflectionEnabled: v })}
                />
              </Row>
            </Card>
          )}

          {section === "notifications" && (
            <Card title="Native notifications">
              <Row label="Enable notifications" desc="Master switch for everything below.">
                <Toggle checked={settings.notifMaster} onChange={(v) => patch({ notifMaster: v })} />
              </Row>
              <Row label="Morning planning nudge">
                <div className="flex items-center gap-2.5">
                  <input
                    type="time"
                    value={settings.notifMorningTime}
                    onChange={(e) => patch({ notifMorningTime: e.target.value || "09:00" })}
                    disabled={!settings.notifMaster || !settings.notifMorning}
                    className="h-[28px] rounded-lg border border-bord bg-card px-2 text-[12.5px] text-ink disabled:opacity-40 focus:border-accent/60 focus:outline-none"
                  />
                  <Toggle
                    checked={settings.notifMorning}
                    onChange={(v) => patch({ notifMorning: v })}
                    disabled={!settings.notifMaster}
                  />
                </div>
              </Row>
              <Row label="Due-date reminders" desc="The day before and the morning of a due date.">
                <Toggle
                  checked={settings.notifDue}
                  onChange={(v) => patch({ notifDue: v })}
                  disabled={!settings.notifMaster}
                />
              </Row>
              <Row label="Sprint review ready">
                <Toggle
                  checked={settings.notifReview}
                  onChange={(v) => patch({ notifReview: v })}
                  disabled={!settings.notifMaster}
                />
              </Row>
              <Row label="Goal countdown" desc="7 days and 1 day before a goal's target date.">
                <Toggle
                  checked={settings.notifGoal}
                  onChange={(v) => patch({ notifGoal: v })}
                  disabled={!settings.notifMaster}
                />
              </Row>
            </Card>
          )}

          {section === "shortcuts" && (
            <Card title="Keyboard shortcuts">
              {SHORTCUT_ROWS.map((r) => (
                <Row
                  key={r.key}
                  label={r.label}
                  desc={r.global ? "Works anywhere in macOS, even when Flow is in the background." : undefined}
                >
                  <ShortcutRecorder k={r.key} />
                </Row>
              ))}
            </Card>
          )}

          {section === "data" && (
            <>
              <Card title="Database">
                <Row
                  label="Reveal database in Finder"
                  desc="A single local SQLite file — your data never leaves this Mac."
                >
                  <Button icon={<IconEye size={13} />} onClick={() => void revealDb()} disabled={!isTauri}>
                    Reveal
                  </Button>
                </Row>
                <Row label="Export backup" desc="Copies the database with a timestamp.">
                  <Button icon={<IconDownload size={13} />} onClick={() => void exportBackup()} disabled={!isTauri}>
                    Export
                  </Button>
                </Row>
                <Row label="Import backup" desc="Replaces all current data with a backup file.">
                  <Button icon={<IconUpload size={13} />} onClick={() => void importBackup()} disabled={!isTauri}>
                    Import
                  </Button>
                </Row>
                {!isTauri && (
                  <p className="py-2.5 text-[11.5px] text-ink3">
                    Database actions are available in the packaged desktop app.
                  </p>
                )}
              </Card>
              <Card title="Archive">
                <Row
                  label="Archive & history"
                  desc="Browse and restore archived tasks, projects, and past goals."
                >
                  <Button icon={<IconArchive size={13} />} onClick={() => go({ name: "archive" })}>
                    Open
                  </Button>
                </Row>
              </Card>
              <Card title="Demo">
                <Row
                  label="Insert demo data"
                  desc="3 projects, 2 goals, ~25 tasks — a quick way to feel the app."
                >
                  <Button
                    onClick={() =>
                      tasksCount > 0
                        ? ask({
                            title: "Insert demo data?",
                            message:
                              "Demo projects and tasks will be added alongside your existing data.",
                            confirmLabel: "Insert",
                            onConfirm: () => {
                              insertDemoData();
                              toast("Demo data inserted", "success");
                            },
                          })
                        : (insertDemoData(), toast("Demo data inserted", "success"))
                    }
                  >
                    Insert
                  </Button>
                </Row>
              </Card>
            </>
          )}
        </div>
      </div>
    </ViewShell>
  );
}
