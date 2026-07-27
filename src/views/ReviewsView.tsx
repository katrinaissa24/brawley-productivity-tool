import { useState } from "react";
import { format } from "date-fns";
import { marked } from "marked";
import type { Review, ReviewSnapshot } from "../types";
import { useData } from "../stores/data";
import { useUI } from "../stores/ui";
import { activeSprint, reviewDue, sprintLabel } from "../stores/selectors";
import { cn, plural } from "../lib/util";
import { ViewShell } from "../components/ViewShell";
import { Button, EmptyState, SectionLabel } from "../components/ui/primitives";
import {
  IconCheckCircle,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconSparkle,
  IconTrash,
} from "../components/icons";

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
  const ask = useUI((s) => s.ask);
  const deleteReview = useData((s) => s.deleteReview);
  let snap: ReviewSnapshot | null = null;
  try {
    snap = JSON.parse(review.goalsSnapshot) as ReviewSnapshot;
  } catch {
    snap = null;
  }
  return (
    <div className="group rounded-xl border border-bord bg-card shadow-card">
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
        <span
          role="button"
          title="Delete review"
          onClick={(e) => {
            e.stopPropagation();
            ask({
              title: "Delete this review?",
              message: "The recap, goal check-ins, and reflections from this review will be permanently deleted.",
              confirmLabel: "Delete",
              danger: true,
              onConfirm: () => deleteReview(review.id),
            });
          }}
          className="rounded-md p-1 text-ink3 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
        >
          <IconTrash size={13} />
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

/** Every saved sprint review — reached from the Sprint page. */
export function ReviewsView() {
  const setReviewOpen = useUI((s) => s.setReviewOpen);
  const go = useUI((s) => s.go);
  const sprints = useData((s) => s.sprints);
  const reviews = useData((s) => s.reviews);

  const sprint = activeSprint(sprints);
  const due = reviewDue(sprint);

  return (
    <ViewShell
      title="Sprint reviews"
      meta={
        <button
          onClick={() => go({ name: "sprint" })}
          className="inline-flex items-center gap-1 text-ink3 transition-colors hover:text-ink2"
        >
          <IconChevronLeft size={12} />
          Back to Sprint · {sprint ? sprintLabel(sprint) : "—"}
        </button>
      }
      actions={
        <Button
          variant={due ? "primary" : "secondary"}
          icon={<IconCheckCircle size={13} />}
          onClick={() => {
            go({ name: "sprint" });
            setReviewOpen(true);
          }}
        >
          {due ? "Start review" : "Review early"}
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-[780px]">
        {reviews.length === 0 ? (
          <EmptyState
            icon={<IconSparkle size={26} />}
            title="No reviews yet"
            hint={
              due
                ? "This sprint has ended — run the review and it'll be saved here for good."
                : "Every review you run gets saved here: recap, goal check-ins, and reflections, browsable forever."
            }
          />
        ) : (
          <>
            <SectionLabel className="mb-2.5">{plural(reviews.length, "saved review")}</SectionLabel>
            <div className="flex flex-col gap-2">
              {reviews.map((r) => (
                <PastReview key={r.id} review={r} />
              ))}
            </div>
          </>
        )}
      </div>
    </ViewShell>
  );
}
