import TeamFrame from "@/components/play/TeamFrame";
import TimelineBuilder from "@/components/play/TimelineBuilder";
import { EmptyState, PageHeader } from "@/components/ui";
import { getPlayContext } from "@/lib/play";
import { createClient } from "@/lib/supabase/server";
import type { Stage, TimelineEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const { team, caseRow, evidence, writable, shownStage, versions, closedReason } = await getPlayContext();
  if (!caseRow) return <EmptyState title="Case sealed">Your case file opens when the investigation starts.</EmptyState>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("timeline_entries")
    .select("id, stage, position, evidence_id, time_label, description")
    .eq("team_id", team.id)
    .order("position")
    .returns<(TimelineEntry & { stage: Stage })[]>();
  const all = data ?? [];

  const entries = all.filter((e) => e.stage === shownStage);
  const version = versions.get(`timeline_${shownStage}`) ?? 0;
  const initial = all.filter((e) => e.stage === "initial");
  const options = evidence.map((e) => ({ id: e.id, code: e.code, title: e.title, time_label: e.time_label }));
  const codeOf = new Map(evidence.map((e) => [e.id, e.code]));

  return (
    <div className="space-y-6">
      <TeamFrame />
      <PageHeader
        kicker={shownStage === "initial" ? "Step 2 · initial investigation" : "Step 2 · revised after the twist"}
        title="Incident timeline"
        description={writable ? "Reconstruct what happened, in order. Saves automatically." : `Read-only. ${closedReason}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <TimelineBuilder key={`${shownStage}-${version}`} stage={shownStage} initialEntries={entries} evidence={options} writable={writable} version={version} />
        </div>
        <aside className="h-fit space-y-3 rounded-xl border border-line bg-panel p-4 text-sm lg:sticky lg:top-16">
          <h2 className="font-semibold">A good timeline</h2>
          <ul className="space-y-2 text-muted">
            <li>✓ Covers the <b className="text-text">whole chain</b> of events, from first cause to final impact.</li>
            <li>✓ Is in the <b className="text-text">right order</b>.</li>
            <li>✓ Links every step to the <b className="text-text">evidence</b> that proves it.</li>
            <li>✗ Red herrings and noise in the timeline <b className="text-text">cost points</b>.</li>
          </ul>
          <p className="text-xs text-muted">Only one person should edit the timeline at a time. If a teammate saves first you’ll see a warning — nothing gets overwritten.</p>
        </aside>
      </div>

      {shownStage === "final" && initial.length > 0 && (
        <details className="rounded-xl border border-line bg-panel p-4">
          <summary className="cursor-pointer text-sm text-muted">Your initial timeline (locked, for comparison)</summary>
          <ol className="mt-3 space-y-1 text-sm">
            {initial.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="w-6 text-right text-muted">{e.position}.</span>
                <span className="w-16 font-mono text-muted">{e.time_label}</span>
                <span className="w-12 font-mono text-accent">{e.evidence_id ? codeOf.get(e.evidence_id) : ""}</span>
                <span>{e.description}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
