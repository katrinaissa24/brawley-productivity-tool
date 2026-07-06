import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { activeProjects, activeSprint, isOpen, reviewDue } from "../stores/selectors";
import { cn, fuzzyScore } from "../lib/util";
import { exportBackup } from "../lib/native";
import {
  IconArchive,
  IconArrowRight,
  IconChart,
  IconCheckCircle,
  IconCircle,
  IconDownload,
  IconInbox,
  IconPlus,
  IconSettings,
  IconSparkle,
  IconSun,
  IconTarget,
  IconZap,
} from "./icons";
import { Kbd } from "./ui/primitives";

interface Item {
  id: string;
  kind: "action" | "task" | "project" | "goal";
  title: string;
  subtitle?: string;
  icon: ReactNode;
  score: number;
  run: () => void;
}

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPaletteOpen);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const goals = useData((s) => s.goals);
  const sprints = useData((s) => s.sprints);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const items = useMemo((): Item[] => {
    if (!open) return [];
    const ui = useUI.getState();
    const data = useData.getState();
    const close = () => setOpen(false);
    const query = q.trim();

    const actions: Omit<Item, "score">[] = [
      {
        id: "a:new-task",
        kind: "action",
        title: "New task",
        icon: <IconPlus size={14} />,
        run: () => {
          close();
          const view = ui.view;
          if (view.name === "project") {
            const t = data.addTask({
              title: "New task",
              projectId: view.projectId,
              priority: useSettings.getState().settings.defaultPriority,
            });
            ui.openDetail(t.id);
          } else {
            ui.go({ name: "inbox" });
            setTimeout(() => ui.focusCapture(), 40);
          }
        },
      },
      { id: "a:inbox", kind: "action", title: "Go to Inbox", icon: <IconInbox size={14} />, run: () => (close(), ui.go({ name: "inbox" })) },
      { id: "a:today", kind: "action", title: "Go to Today", icon: <IconSun size={14} />, run: () => (close(), ui.go({ name: "today" })) },
      { id: "a:sprint", kind: "action", title: "Go to Sprint", icon: <IconZap size={14} />, run: () => (close(), ui.go({ name: "sprint" })) },
      { id: "a:review", kind: "action", title: "Go to Review", icon: <IconCheckCircle size={14} />, run: () => (close(), ui.go({ name: "review" })) },
      { id: "a:insights", kind: "action", title: "Go to Insights", icon: <IconChart size={14} />, run: () => (close(), ui.go({ name: "insights" })) },
      { id: "a:plan", kind: "action", title: "Plan my day", icon: <IconSparkle size={14} />, run: () => (close(), ui.go({ name: "today" }), ui.setPlanDayOpen(true)) },
      {
        id: "a:start-review",
        kind: "action",
        title: reviewDue(activeSprint(sprints)) ? "Start review (due)" : "Start review",
        icon: <IconCheckCircle size={14} />,
        run: () => {
          close();
          ui.go({ name: "review" });
          ui.setReviewOpen(true);
        },
      },
      { id: "a:new-project", kind: "action", title: "New project", icon: <IconPlus size={14} />, run: () => (close(), ui.setProjectModal({})) },
      { id: "a:new-goal", kind: "action", title: "New goal", icon: <IconTarget size={14} />, run: () => (close(), ui.setGoalModal({})) },
      { id: "a:settings", kind: "action", title: "Open Settings", icon: <IconSettings size={14} />, run: () => (close(), ui.go({ name: "settings" })) },
      { id: "a:archive", kind: "action", title: "Open Archive & History", icon: <IconArchive size={14} />, run: () => (close(), ui.go({ name: "archive" })) },
      { id: "a:export", kind: "action", title: "Export backup", icon: <IconDownload size={14} />, run: () => (close(), void exportBackup()) },
    ];

    const out: Item[] = [];
    for (const a of actions) {
      const score = query ? fuzzyScore(query, a.title) : 1;
      if (score >= 0) out.push({ ...a, score: score + 2 });
    }

    const projById = new Map(projects.map((p) => [p.id, p]));

    for (const t of tasks) {
      if (t.archivedAt) continue;
      const score = query ? fuzzyScore(query, t.title) : -1;
      if (query && score < 0) continue;
      const proj = t.projectId ? projById.get(t.projectId) : null;
      out.push({
        id: `t:${t.id}`,
        kind: "task",
        title: t.title,
        subtitle: proj?.name ?? "Inbox",
        icon: t.status === "done" ? <IconCheckCircle size={14} /> : <IconCircle size={14} />,
        score: (query ? score : 0) + (isOpen(t) ? 1 : -4),
        run: () => {
          setOpen(false);
          useUI.getState().openDetail(t.id);
        },
      });
    }

    for (const p of activeProjects(projects)) {
      const score = query ? fuzzyScore(query, p.name) : -1;
      if (query && score < 0) continue;
      out.push({
        id: `p:${p.id}`,
        kind: "project",
        title: p.name,
        subtitle: "Project",
        icon: <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />,
        score: (query ? score : 0) + 1.5,
        run: () => {
          setOpen(false);
          useUI.getState().go({ name: "project", projectId: p.id });
        },
      });
    }

    for (const g of goals) {
      if (g.status !== "active") continue;
      const score = query ? fuzzyScore(query, g.title) : -1;
      if (query && score < 0) continue;
      out.push({
        id: `g:${g.id}`,
        kind: "goal",
        title: g.title,
        subtitle: `Goal · ${projById.get(g.projectId)?.name ?? ""}`,
        icon: <IconTarget size={14} />,
        score: (query ? score : 0) + 1,
        run: () => {
          setOpen(false);
          useUI.getState().go({ name: "goal", goalId: g.id });
        },
      });
    }

    out.sort((a, b) => b.score - a.score);
    return query ? out.slice(0, 12) : out.filter((i) => i.kind === "action").slice(0, 9);
  }, [open, q, tasks, projects, goals, sprints, setOpen]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    const el = listRef.current?.children[sel] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[65] flex items-start justify-center bg-black/25 dark:bg-black/45 anim-fade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="mt-[14vh] w-[580px] max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-bord bg-pop shadow-pop anim-scale">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              items[sel]?.run();
            }
          }}
          placeholder="Search tasks, projects, goals — or run a command…"
          className="h-[46px] w-full border-b border-bord bg-transparent px-4 text-[14.5px] text-ink outline-none placeholder:text-ink3"
        />
        <div ref={listRef} className="max-h-[340px] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-ink3">No matches.</p>
          )}
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => item.run()}
              onMouseMove={() => setSel(i)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                i === sel ? "bg-accent text-white" : "text-ink",
              )}
            >
              <span className={cn("flex w-4 shrink-0 items-center justify-center", i === sel ? "text-white" : "text-ink3")}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{item.title}</span>
              {item.subtitle && (
                <span className={cn("shrink-0 text-[11.5px]", i === sel ? "text-white/70" : "text-ink3")}>
                  {item.subtitle}
                </span>
              )}
              {i === sel && <IconArrowRight size={12} className="shrink-0 text-white/80" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-bord px-3.5 py-2 text-[11px] text-ink3">
          <span className="flex items-center gap-1">
            <Kbd combo="enter" /> open
          </span>
          <span className="flex items-center gap-1">↑↓ navigate</span>
          <span className="flex items-center gap-1">
            <Kbd combo="esc" /> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
