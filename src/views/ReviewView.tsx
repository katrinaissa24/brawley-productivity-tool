import { useState } from "react";
import { format } from "date-fns";
import { marked } from "marked";
import type { Review, ReviewSnapshot } from "../types";
import { useData } from "../stores/data";
import { useUI } from "../stores/ui";
import { activeSprint, reviewDue, sprintDaysLeft, sprintLabel } from "../stores/selectors";
import { cn, plural } from "../lib/util";
import { ViewShell } from "../components/ViewShell";
import { ReviewWizard } from "./ReviewWizard";
import { Button, EmptyState, SectionLabel } from "../components/ui/primitives";
import { IconCheckCircle, IconChevronDown, IconChevronRight, IconSparkle } from "../components/icons";

const MARK_STYLE: Record<string, string> = {
  on_track: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  at_risk: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  off_track: "bg-red-500/15 text-red-600 dark:text-red-400",
};
const MARK_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};

function PastReview({ review }: { review: Review }) {
  const [open, setOpen] = useState(false);
  let snap: ReviewSnapshot | null = null;
  try {
    snap = JSON.parse(review.goalsSnapshot) as ReviewSnapshot;
  } catch {
    snap = null;
  }
  return (
    <div className="rounded-xl border border-bord bg-card shadow-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {open ? <IconChevronDown size={14} className="text-ink3" /> : <IconChevronRight size={14} className="text-ink3" />}
        <span className="flex-1 text-[13.5px] font-medium text-ink">
          Sprint · {snap?.sprintLabel ?? "—"}
        </span>
        {snap && (
          <span className="rounded-md bg-panel px-2 py-0.5 text-[11.5px] font-medium text-ink3 tabular-nums">
            {snap.stats.done}/{snap.stats.committed} done
          </span>
        )}
        <span className="text-[11.5px] text-ink3">
          {format(new Date(review.createdAt), "MMM d, yyyy")}
        </span>
      </button>
      {open && (
        <div className="border-t border-bord px-4 py-3 anim-fade">
          {snap && snap.goals.length > 0 && (
            <>
              <SectionLabel className="mb-2">Goal check-in</SectionLabel>
              <div className="mb-4 flex flex-col gap-1.5">
                {snap.goals.map((g) => (
                  <div key={g.goalId} className="flex items-center gap-2.5 text-[13px]">
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold", MARK_STYLE[g.mark])}>
                      {MARK_LABEL[g.mark]}
                    </span>
                    <span className="truncate text-ink">{g.title}</span>
                    <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-ink3">
                      {g.progress}% · {g.daysLeft < 0 ? `${-g.daysLeft}d over` : `${g.daysLeft}d left`}
                    </span>
                  </div>
                ))}
                {snap.goals.some((g) => g.note) && (
                  <div className="mt-1 flex flex-col gap-1">
                    {snap.goals
                      .filter((g) => g.note)
                      .map((g) => (
                        <p key={g.goalId} className="text-[12px] leading-relaxed text-ink3">
                          <span className="font-medium text-ink2">{g.title}:</span> {g.note}
                        </p>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
          <SectionLabel className="mb-2">Reflections</SectionLabel>
          {review.reflections ? (
            <div className="md-body" dangerouslySetInnerHTML={{ __html: marked.parse(review.reflections) as string }} />
          ) : (
            <p className="text-[12.5px] italic text-ink3">Skipped.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ReviewView() {
  const reviewOpen = useUI((s) => s.reviewOpen);
  const setReviewOpen = useUI((s) => s.setReviewOpen);
  const sprints = useData((s) => s.sprints);
  const reviews = useData((s) => s.reviews);

  const sprint = activeSprint(sprints);
  const due = reviewDue(sprint);

  if (reviewOpen) return <ReviewWizard />;

  return (
    <ViewShell
      title="Review"
      meta="The weekly ritual that keeps goals honest"
    >
      <div className="max-w-[680px]">
        <div
          className={cn(
            "flex items-center gap-5 rounded-2xl border px-6 py-5 shadow-card",
            due ? "border-accent/40 bg-accent/5" : "border-bord bg-card",
          )}
        >
          <span className={cn("rounded-xl p-3", due ? "bg-accent/15 text-accent" : "bg-panel text-ink3")}>
            <IconSparkle size={22} />
          </span>
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-ink">
              {due
                ? "Sprint ended — time for your review"
                : sprint
                  ? `${sprintDaysLeft(sprint)} ${sprintDaysLeft(sprint) === 1 ? "day" : "days"} left in this sprint`
                  : "No active sprint"}
            </p>
            <p className="mt-0.5 text-[13px] text-ink2">
              {due
                ? "Recap the week, triage stale tasks, check every goal, plan the next sprint."
                : `Sprint · ${sprint ? sprintLabel(sprint) : "—"} — you can always review early.`}
            </p>
          </div>
          <Button variant={due ? "primary" : "secondary"} icon={<IconCheckCircle size={14} />} onClick={() => setReviewOpen(true)}>
            {due ? "Start review" : "Review early"}
          </Button>
        </div>

        <div className="mt-8">
          <SectionLabel className="mb-2.5">Past reviews · {reviews.length}</SectionLabel>
          {reviews.length === 0 ? (
            <EmptyState
              title="No reviews yet"
              hint="Your first weekly review will be saved here — recap, goal check-ins, and reflections, browsable forever."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {reviews.map((r) => (
                <PastReview key={r.id} review={r} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ViewShell>
  );
}
