import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, type ReactNode } from "react";
import type { Project, View } from "../types";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import {
  activeProjects,
  activeSprint,
  CAL_INBOX_KEY,
  calendarActiveKey,
  INBOX_COLOR,
  inboxTasks,
  isOpen,
  reviewDue,
  todayOpenCount,
  unscheduledTasks,
} from "../stores/selectors";
import { cn } from "../lib/util";
import {
  IconCalendar,
  IconChart,
  IconCheckCircle,
  IconChevronRight,
  IconInbox,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSun,
  IconZap,
} from "./icons";
import { FloatingMenu, Kbd, type MenuItem } from "./ui/primitives";

const NAV_W = 232; // the nav bar itself
const RAIL_W = 34; // calendar-only arrow gutter to its right

/** Per-project calendar target state, computed once in Sidebar. */
interface CalRail {
  active: boolean;
  trayOpen: boolean;
  count: number;
  color: string;
  onClick: () => void;
}

/**
 * Calendar-mode arrow beside a row: click makes that project the calendar's
 * active one (new events land there); click the active arrow again to toggle
 * its tray of unscheduled (no-date) tasks.
 */
function RailArrow({ rail }: { rail: CalRail }) {
  const { active, trayOpen, count, color, onClick } = rail;
  return (
    <span className="flex w-[34px] shrink-0 items-center justify-center">
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        title={
          active
            ? trayOpen
              ? "Hide unscheduled tasks"
              : `Show ${count} unscheduled task${count === 1 ? "" : "s"}`
            : "Use for new calendar events"
        }
        className={cn(
          "flex h-[20px] w-[20px] items-center justify-center rounded-full border-[1.5px] transition-all duration-150",
          active ? "shadow-card" : "opacity-60 hover:opacity-100 hover:scale-110",
        )}
        style={active ? { background: color, borderColor: color } : { borderColor: color, color }}
      >
        <IconChevronRight
          size={11}
          strokeWidth={2.8}
          className={cn("transition-transform duration-150", active && "text-white", active && trayOpen && "rotate-180")}
        />
      </button>
    </span>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  badge,
  dot,
  shortcut,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  dot?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-2.5 h-[30px] text-[13px] transition-colors duration-150",
        active
          ? "bg-accent/10 text-accent font-medium"
          : "text-ink2 hover:bg-ink/5 hover:text-ink",
      )}
    >
      <span className={cn("shrink-0", active ? "text-accent" : "text-ink3 group-hover:text-ink2")}>
        {icon}
      </span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent/15 text-accent text-[11px] font-semibold inline-flex items-center justify-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {dot && <span className="h-2 w-2 rounded-full bg-accent" />}
    </button>
  );
}

function ProjectRow({ project, rail }: { project: Project; rail: CalRail | null }) {
  const view = useUI((s) => s.view);
  const go = useUI((s) => s.go);
  const tasks = useData((s) => s.tasks);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const openCount = tasks.filter((t) => t.projectId === project.id && isOpen(t)).length;
  const active = view.name === "project" && view.projectId === project.id;

  const menuItems = (): MenuItem[] => {
    const ui = useUI.getState();
    const data = useData.getState();
    return [
      {
        label: "Edit project",
        onSelect: () => ui.setProjectModal({ projectId: project.id }),
      },
      {
        label: "New goal",
        onSelect: () => ui.setGoalModal({ projectId: project.id }),
      },
      { divider: true, label: "" },
      {
        label: "Archive project",
        onSelect: () =>
          ui.ask({
            title: "Archive project?",
            message: `"${project.name}" will be hidden from the sidebar. Tasks are preserved; restore anytime from Settings → Archive.`,
            confirmLabel: "Archive",
            onConfirm: () => {
              data.archiveProject(project.id);
              if (ui.view.name === "project" && ui.view.projectId === project.id) {
                ui.go({ name: "today" });
              }
            },
          }),
      },
      {
        label: "Delete project…",
        danger: true,
        onSelect: () => {
          const count = data.tasks.filter((t) => t.projectId === project.id).length;
          ui.ask({
            title: "Delete project permanently?",
            message: `"${project.name}"${count > 0 ? ` and its ${count} task${count === 1 ? "" : "s"}` : ""} will be gone for good — this cannot be undone. Archive instead if you might want it back.`,
            confirmLabel: "Delete forever",
            danger: true,
            onConfirm: () => {
              data.deleteProjectHard(project.id);
              if (ui.view.name === "project" && ui.view.projectId === project.id) {
                ui.go({ name: "today" });
              }
            },
          });
        },
      },
    ];
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, active: dragActive } =
    useSortable({
      id: `proj:${project.id}`,
      data: { type: "project", projectId: project.id },
    });

  const taskHovering = isOver && dragActive?.data.current?.type === "task";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <div className={cn("min-w-0 flex-1", rail && "pr-3")}>
        <button
          onClick={() => go({ name: "project", projectId: project.id })}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-lg px-2.5 h-[30px] text-[13px] transition-all duration-150",
            active ? "bg-accent/10 text-ink font-medium" : "text-ink2 hover:bg-ink/5 hover:text-ink",
            taskHovering && "ring-2 ring-accent/60 bg-accent/10",
          )}
        >
          <span
            className="h-[9px] w-[9px] rounded-full shrink-0 transition-transform duration-150"
            style={{ background: project.color, transform: taskHovering ? "scale(1.35)" : undefined }}
          />
          <span className="flex-1 text-left truncate">{project.name}</span>
          {openCount > 0 && (
            <span className="text-[11px] text-ink3 tabular-nums group-hover:text-ink2">{openCount}</span>
          )}
        </button>
      </div>
      {rail && <RailArrow rail={rail} />}
      {menu && <FloatingMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />}
    </div>
  );
}

export function Sidebar() {
  const view = useUI((s) => s.view);
  const go = useUI((s) => s.go);
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);
  const setProjectModal = useUI((s) => s.setProjectModal);
  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const sprints = useData((s) => s.sprints);
  const settings = useSettings((s) => s.settings);
  const setViewPref = useSettings((s) => s.setViewPref);

  const inboxCount = inboxTasks(tasks).length;
  const todayCount = todayOpenCount(tasks, projects);
  const projs = activeProjects(projects);
  const due = reviewDue(activeSprint(sprints));

  const is = (name: View["name"]) => view.name === name;

  // Calendar mode: a gutter appears to the right of the nav with one arrow per
  // project — pick where new calendar events land without leaving the page.
  const calMode = view.name === "calendar";
  const calActiveKey = calendarActiveKey(settings.viewPrefs, projs);
  const trayOpen = settings.viewPrefs["cal.tray"] === "1";
  const railFor = (key: string, color: string): CalRail => ({
    active: calActiveKey === key,
    trayOpen,
    count: unscheduledTasks(tasks, key === CAL_INBOX_KEY ? null : key).length,
    color,
    onClick: () => {
      if (calActiveKey === key) setViewPref("cal.tray", trayOpen ? "0" : "1");
      else setViewPref("cal.project", key);
    },
  });

  /** Reserves the rail gutter on rows without an arrow so widths line up. */
  const gutter = calMode ? <span className="w-[34px] shrink-0" /> : null;

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r border-bord",
        calMode ? "" : "bg-panel",
      )}
      style={{ width: calMode ? NAV_W + RAIL_W : NAV_W }}
    >
      {calMode && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 border-r border-bord bg-panel"
          style={{ width: NAV_W }}
        />
      )}
      <div className="relative flex h-full min-h-0 flex-col">
        {/* Traffic-light spacer + drag region */}
        <div data-tauri-drag-region className="h-[38px] shrink-0" />

        <div className={cn("flex items-center", calMode ? "pl-3" : "px-3")}>
          <div className={cn("min-w-0 flex-1", calMode && "pr-3")}>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-bord bg-card/70 px-2.5 h-[30px] text-[13px] text-ink3 hover:border-bord2 hover:text-ink2 transition-colors"
            >
              <IconSearch size={13} />
              <span className="flex-1 text-left">Search</span>
              <Kbd combo="mod+k" />
            </button>
          </div>
          {gutter}
        </div>

        <nav className={cn("mt-3 flex flex-col gap-0.5", calMode ? "pl-3" : "px-3")}>
          <div className="flex items-center">
            <div className={cn("min-w-0 flex-1", calMode && "pr-3")}>
              <NavItem
                icon={<IconInbox size={15} />}
                label="Inbox"
                badge={inboxCount}
                active={is("inbox")}
                onClick={() => go({ name: "inbox" })}
                shortcut="⌘1"
              />
            </div>
            {calMode && <RailArrow rail={railFor(CAL_INBOX_KEY, INBOX_COLOR)} />}
          </div>
          {[
            {
              icon: <IconSun size={15} />,
              label: "Today",
              badge: todayCount,
              active: is("today"),
              onClick: () => go({ name: "today" }),
              shortcut: "⌘2",
            },
            {
              icon: <IconZap size={15} />,
              label: "Sprint",
              active: is("sprint"),
              onClick: () => go({ name: "sprint" }),
              shortcut: "⌘3",
            },
            {
              icon: <IconCheckCircle size={15} />,
              label: "Review",
              dot: due,
              active: is("review"),
              onClick: () => go({ name: "review" }),
              shortcut: "⌘4",
            },
            {
              icon: <IconChart size={15} />,
              label: "Insights",
              active: is("insights"),
              onClick: () => go({ name: "insights" }),
              shortcut: "⌘5",
            },
            {
              icon: <IconCalendar size={15} />,
              label: "Calendar",
              active: is("calendar"),
              onClick: () => go({ name: "calendar" }),
            },
          ].map((item) => (
            <div key={item.label} className="flex items-center">
              <div className={cn("min-w-0 flex-1", calMode && "pr-3")}>
                <NavItem {...item} />
              </div>
              {gutter}
            </div>
          ))}
        </nav>

        <div className={cn("mt-4 mb-1 flex items-center", calMode ? "pl-5" : "px-5")}>
          <div className={cn("flex min-w-0 flex-1 items-center justify-between", calMode && "pr-5")}>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3">
              Projects
            </span>
            <button
              onClick={() => setProjectModal({})}
              className="p-0.5 rounded text-ink3 hover:text-ink hover:bg-ink/5 transition-colors"
              title="New project"
            >
              <IconPlus size={14} />
            </button>
          </div>
          {gutter}
        </div>

        <div className={cn("flex-1 overflow-y-auto pb-2", calMode ? "pl-3" : "px-3")}>
          <SortableContext
            items={projs.map((p) => `proj:${p.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-0.5">
              {projs.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  rail={calMode ? railFor(p.id, p.color) : null}
                />
              ))}
            </div>
          </SortableContext>
          {projs.length === 0 && (
            <div className="flex items-center">
              <div className={cn("min-w-0 flex-1", calMode && "pr-3")}>
                <button
                  onClick={() => setProjectModal({})}
                  className="mt-1 w-full rounded-lg border border-dashed border-bord2 px-2.5 py-2 text-left text-[12.5px] text-ink3 hover:text-ink2 hover:border-ink3 transition-colors"
                >
                  + Create your first project
                </button>
              </div>
              {gutter}
            </div>
          )}
        </div>

        <div className={cn("border-t border-bord py-2", calMode ? "pl-3" : "px-3")}>
          <div className="flex items-center">
            <div className={cn("min-w-0 flex-1", calMode && "pr-3")}>
              <NavItem
                icon={<IconSettings size={15} />}
                label="Settings"
                active={is("settings")}
                onClick={() => go({ name: "settings" })}
                shortcut="⌘,"
              />
            </div>
            {gutter}
          </div>
        </div>
      </div>
    </aside>
  );
}
