import { useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { useData } from "../stores/data";
import { useSettings, isDark } from "../stores/settings";
import { useUI } from "../stores/ui";
import {
  activeGoals,
  activeProjects,
  activeSprint,
  doneInRange,
  goalProgress,
  sprintLabel,
  trendByDayStacked,
  workloadMinutes,
} from "../stores/selectors";
import { addDaysStr, cn, daysUntil, formatMinutes, parseDateStr, plural, todayStr } from "../lib/util";
import { ViewShell } from "../components/ViewShell";
import { Doughnut } from "../components/charts";
import { EmptyState, ProgressBar, Segmented, SectionLabel } from "../components/ui/primitives";
import { IconChart } from "../components/icons";
import { format } from "date-fns";

type Range = "sprint" | "last_sprint" | "30d" | "all";

function ChartCard({ title, children, className, right }: { title: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-bord bg-card p-4 shadow-card", className)}>
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>{title}</SectionLabel>
        {right}
      </div>
      {children}
    </div>
  );
}

export function InsightsView() {
  const tasks = useData((s) => s.tasks);
  const projects = useData((s) => s.projects);
  const goals = useData((s) => s.goals);
  const milestones = useData((s) => s.milestones);
  const sprints = useData((s) => s.sprints);
  const settings = useSettings((s) => s.settings);
  const go = useUI((s) => s.go);
  const dark = isDark(settings);

  const [range, setRange] = useState<Range>("sprint");
  const [focusMode, setFocusMode] = useState<"count" | "minutes">("count");
  const [trendHover, setTrendHover] = useState<{
    x: number;
    y: number;
    date: string;
    count: number;
    parts: { name: string; color: string; value: number }[];
  } | null>(null);
  const trendRef = useRef<HTMLDivElement>(null);
  const trendFlip =
    trendHover != null &&
    trendHover.x > (trendRef.current?.clientWidth ?? 600) - 150;

  const sprint = activeSprint(sprints);
  const lastSprint = useMemo(
    () =>
      sprints
        .filter((s) => s.status === "completed")
        .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0] ?? null,
    [sprints],
  );

  const [from, to] = useMemo((): [string, string] => {
    const today = todayStr();
    switch (range) {
      case "sprint":
        return sprint ? [sprint.startDate, sprint.endDate < today ? today : sprint.endDate] : [addDaysStr(today, -6), today];
      case "last_sprint":
        return lastSprint ? [lastSprint.startDate, lastSprint.endDate] : [addDaysStr(today, -13), addDaysStr(today, -7)];
      case "30d":
        return [addDaysStr(today, -29), today];
      case "all": {
        const first = tasks.reduce<string | null>((min, t) => {
          const c = t.completedAt?.slice(0, 10) ?? null;
          return c && (!min || c < min) ? c : min;
        }, null);
        return [first ?? addDaysStr(today, -29), today];
      }
    }
  }, [range, sprint, lastSprint, tasks]);

  const doneTasks = useMemo(() => doneInRange(tasks, from, to), [tasks, from, to]);
  const projs = activeProjects(projects);

  const focusData = useMemo(() => {
    const byProject = new Map<string, number>();
    for (const t of doneTasks) {
      if (!t.projectId) continue;
      const v = focusMode === "count" ? 1 : (t.estimateMinutes ?? 0);
      byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + v);
    }
    return projs
      .map((p) => ({ name: p.name, color: p.color, value: byProject.get(p.id) ?? 0 }))
      .filter((d) => d.value > 0);
  }, [doneTasks, projs, focusMode]);
  const focusTotal = focusData.reduce((a, d) => a + d.value, 0);

  const trend = useMemo(
    () => trendByDayStacked(tasks, projects, from, to),
    [tasks, projects, from, to],
  );
  const sprintTasksAll = sprint ? tasks.filter((t) => t.sprintId === sprint.id && !t.archivedAt) : [];
  const sprintDone = sprintTasksAll.filter((t) => t.status === "done");
  const sortedGoals = activeGoals(goals);

  const tooltipStyle = {
    background: dark ? "#2f2f35" : "#fff",
    border: `1px solid ${dark ? "#3f3f46" : "#e4e4e7"}`,
    borderRadius: 8,
    fontSize: 12,
    padding: "4px 10px",
    color: dark ? "#f0f0f3" : "#18181b",
  };

  const rangeLabel =
    range === "sprint"
      ? `This sprint${sprint ? ` · ${sprintLabel(sprint)}` : ""}`
      : range === "last_sprint"
        ? `Last sprint${lastSprint ? ` · ${sprintLabel(lastSprint)}` : ""}`
        : range === "30d"
          ? "Last 30 days"
          : "All time";

  const hasAnyData = tasks.some((t) => t.completedAt) || sprintTasksAll.length > 0;

  return (
    <ViewShell
      title="Insights"
      meta={`${rangeLabel} · ${plural(doneTasks.length, "task")} completed`}
      actions={
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "sprint", label: "This sprint" },
            { value: "last_sprint", label: "Last sprint" },
            { value: "30d", label: "30 days" },
            { value: "all", label: "All time" },
          ]}
        />
      }
    >
      {!hasAnyData ? (
        <EmptyState
          icon={<IconChart size={28} />}
          title="No signal yet"
          hint="Complete a few tasks and the charts light up — everything here is powered by real completions, not vibes."
        />
      ) : (
        <div className="grid max-w-[880px] grid-cols-2 gap-3.5">
          {/* 1 — sprint doughnut */}
          <ChartCard title="Sprint progress">
            {sprint && sprintTasksAll.length > 0 ? (
              <div className="flex items-center gap-5">
                <Doughnut done={sprintDone.length} total={sprintTasksAll.length} size={110} thickness={12} />
                <div className="text-[13px] leading-relaxed text-ink2">
                  <p className="text-[15px] font-semibold text-ink">
                    {sprintDone.length} of {sprintTasksAll.length} done
                  </p>
                  <p className="mt-0.5">{sprintLabel(sprint)}</p>
                  <p className="mt-0.5 text-ink3">
                    ~{formatMinutes(workloadMinutes(sprintTasksAll.filter((t) => t.status !== "done")))} remaining
                  </p>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-[12.5px] text-ink3">Nothing committed to the sprint yet.</p>
            )}
          </ChartCard>

          {/* 2 — focus pie */}
          <ChartCard
            title="Focus distribution"
            right={
              <Segmented
                value={focusMode}
                onChange={setFocusMode}
                options={[
                  { value: "count", label: "Tasks" },
                  { value: "minutes", label: "Time" },
                ]}
              />
            }
          >
            {focusData.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-ink3">No completed project tasks in this range.</p>
            ) : (
              <div className="flex items-center gap-4">
                <PieChart width={120} height={120}>
                  <Pie data={focusData} dataKey="value" cx="50%" cy="50%" outerRadius={56} strokeWidth={dark ? 1 : 2} stroke={dark ? "#27272c" : "#fff"} isAnimationActive={false}>
                    {focusData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [focusMode === "count" ? plural(v, "task") : formatMinutes(v), n]} />
                </PieChart>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {focusData
                    .slice()
                    .sort((a, b) => b.value - a.value)
                    .map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-[12.5px]">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                        <span className="truncate text-ink">{d.name}</span>
                        <span className="ml-auto tabular-nums text-ink3">
                          {Math.round((d.value / focusTotal) * 100)}%
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </ChartCard>

          {/* 5 — completion trend, stacked by project */}
          <ChartCard title="Completion trend" className="col-span-2">
            <div ref={trendRef} className="relative h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trend.rows}
                  margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                  onMouseMove={(st) => {
                    const s = st as {
                      isTooltipActive?: boolean;
                      activeLabel?: string | number;
                      chartX?: number;
                      chartY?: number;
                    };
                    if (s?.isTooltipActive && s.activeLabel != null && typeof s.chartX === "number") {
                      const date = String(s.activeLabel);
                      const row = trend.rows.find((r) => r.date === date);
                      const parts = row
                        ? trend.series
                            .map((sr) => ({
                              name: sr.name,
                              color: sr.color,
                              value: Number(row[sr.key] ?? 0),
                            }))
                            .filter((p) => p.value > 0)
                        : [];
                      setTrendHover({
                        x: s.chartX,
                        y: s.chartY ?? 0,
                        date,
                        count: Number(row?.count ?? 0),
                        parts,
                      });
                    } else {
                      setTrendHover(null);
                    }
                  }}
                  onMouseLeave={() => setTrendHover(null)}
                >
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => format(parseDateStr(d), trend.rows.length > 40 ? "MMM d" : "EEE d")}
                    tick={{ fontSize: 10, fill: dark ? "#78787f" : "#a1a1aa" }}
                    axisLine={{ stroke: dark ? "#3a3a41" : "#e4e4e7" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis hide allowDecimals={false} domain={[0, "dataMax"]} />
                  {/* invisible tooltip keeps hover state alive; the visible box follows the mouse below */}
                  <Tooltip content={() => null} cursor={false} isAnimationActive={false} />
                  {trend.series.length === 0 ? (
                    <Bar
                      dataKey="count"
                      fill={settings.accentColor}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                      maxBarSize={26}
                    />
                  ) : (
                    trend.series.map((s, i) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        stackId="trend"
                        fill={s.color}
                        isAnimationActive={false}
                        maxBarSize={26}
                        radius={i === trend.series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))
                  )}
                </BarChart>
              </ResponsiveContainer>
              {trendHover && (
                <div
                  className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-bord bg-pop px-2.5 py-1.5 shadow-pop"
                  style={{
                    left: trendHover.x + (trendFlip ? -14 : 14),
                    top: Math.max(2, trendHover.y - 48),
                    transform: trendFlip ? "translateX(-100%)" : undefined,
                    transition: "left 60ms linear, top 60ms linear",
                  }}
                >
                  <p className="text-[11px] font-medium text-ink3">
                    {format(parseDateStr(trendHover.date), "EEE, MMM d")}
                  </p>
                  <p className="text-[12.5px] font-semibold text-ink">
                    {trendHover.count === 0
                      ? "Nothing completed"
                      : `${plural(trendHover.count, "task")} completed`}
                  </p>
                  {trendHover.parts.length > 0 && (
                    <div className="mt-1 flex flex-col gap-0.5 border-t border-bord pt-1">
                      {trendHover.parts.map((p) => (
                        <div key={p.name} className="flex items-center gap-1.5 text-[11.5px]">
                          <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: p.color }} />
                          <span className="max-w-[160px] truncate text-ink2">{p.name}</span>
                          <span className="ml-auto pl-3 tabular-nums text-ink3">{p.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ChartCard>

          {/* 3 — per-project small multiples */}
          <ChartCard title="Project completion">
            {projs.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-ink3">No projects yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {projs.map((p) => {
                  const pt = tasks.filter((t) => t.projectId === p.id && !t.archivedAt);
                  const pd = pt.filter((t) => t.status === "done");
                  return (
                    <button
                      key={p.id}
                      onClick={() => go({ name: "project", projectId: p.id })}
                      className="flex items-center gap-2.5 rounded-lg border border-bord/70 px-2.5 py-2 text-left transition-colors hover:border-bord2 hover:bg-panel/50"
                    >
                      <Doughnut done={pd.length} total={pt.length} size={38} thickness={5} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.color }} />
                          <span className="truncate text-[12.5px] font-medium text-ink">{p.name}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] tabular-nums text-ink3">
                          {pd.length}/{pt.length} tasks
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </ChartCard>

          {/* 4 — goal progress bars */}
          <ChartCard title="Goal progress">
            {sortedGoals.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-ink3">No active goals.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {sortedGoals.map((g) => {
                  const pct = goalProgress(g, tasks, milestones);
                  const left = daysUntil(g.targetDate);
                  return (
                    <button key={g.id} onClick={() => go({ name: "goal", goalId: g.id })} className="group text-left">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[12.5px] text-ink group-hover:text-accent transition-colors">
                          {g.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px] tabular-nums",
                            left < 0 ? "text-red-500 font-medium" : left <= 7 ? "text-orange-500 font-medium" : "text-ink3",
                          )}
                        >
                          {left < 0 ? `${-left}d over` : `${left}d`} · {pct}%
                        </span>
                      </div>
                      <ProgressBar pct={pct} className="mt-1.5" />
                    </button>
                  );
                })}
              </div>
            )}
          </ChartCard>
        </div>
      )}
    </ViewShell>
  );
}
