import { Cell, Pie, PieChart } from "recharts";
import { useSettings, isDark } from "../stores/settings";
import { cn } from "../lib/util";

/** Doughnut of done vs total with a centered percentage. */
export function Doughnut({
  done,
  total,
  size = 96,
  thickness,
  label,
  className,
}: {
  done: number;
  total: number;
  size?: number;
  thickness?: number;
  label?: string;
  className?: string;
}) {
  const settings = useSettings((s) => s.settings);
  const dark = isDark(settings);
  const track = dark ? "#3f3f46" : "#e7e7ea";
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const data =
    total > 0 ? [{ v: done }, { v: Math.max(0, total - done) }] : [{ v: 0 }, { v: 1 }];
  const outer = size / 2;
  const inner = outer - (thickness ?? Math.max(7, size / 9));

  return (
    <div className={cn("relative inline-flex items-center justify-center shrink-0", className)} style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="v"
          cx="50%"
          cy="50%"
          innerRadius={inner}
          outerRadius={outer}
          startAngle={90}
          endAngle={-270}
          strokeWidth={0}
          isAnimationActive={false}
          cornerRadius={done > 0 && done < total ? 3 : 0}
        >
          <Cell fill={settings.accentColor} />
          <Cell fill={track} />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold tabular-nums text-ink" style={{ fontSize: size / 4.6 }}>
          {pct}%
        </span>
        {label && <span className="text-[10px] text-ink3 mt-[1px]">{label}</span>}
      </div>
    </div>
  );
}
