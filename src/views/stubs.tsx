// Temporary placeholders — replaced as build phases land.
import { ViewShell } from "../components/ViewShell";
import { EmptyState } from "../components/ui/primitives";
import { IconArchive, IconChart, IconCheckCircle, IconTarget, IconZap } from "../components/icons";

export function SprintView() {
  return (
    <ViewShell title="Sprint">
      <EmptyState icon={<IconZap size={28} />} title="Sprint board" hint="Coming right up — Phase 2." />
    </ViewShell>
  );
}

export function ReviewView() {
  return (
    <ViewShell title="Review">
      <EmptyState icon={<IconCheckCircle size={28} />} title="Weekly review" hint="Coming right up — Phase 3." />
    </ViewShell>
  );
}

export function InsightsView() {
  return (
    <ViewShell title="Insights">
      <EmptyState icon={<IconChart size={28} />} title="Insights" hint="Coming right up — Phase 3." />
    </ViewShell>
  );
}

export function ArchiveView() {
  return (
    <ViewShell title="Archive & History">
      <EmptyState icon={<IconArchive size={28} />} title="Archive" hint="Coming right up — Phase 3." />
    </ViewShell>
  );
}

export function GoalView({ goalId }: { goalId: string }) {
  void goalId;
  return (
    <ViewShell title="Goal">
      <EmptyState icon={<IconTarget size={28} />} title="Goal page" hint="Coming right up — Phase 2." />
    </ViewShell>
  );
}
