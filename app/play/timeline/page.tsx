import Sealed from "@/components/play/Sealed";
import TimelineBuilder from "@/components/play/TimelineBuilder";
import { getPlayContext } from "@/lib/play";
import { createClient } from "@/lib/supabase/server";
import type { Stage, TimelineEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const { team, caseRow, evidence, writable, shownStage, versions, closedReason } = await getPlayContext();
  if (!caseRow) return <Sealed />;

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
      <div>
        <h1 className="text-2xl font-bold">Incident timeline</h1>
        <p className="text-sm text-muted">
          {shownStage === "initial" ? "Initial investigation" : "Revised after the new evidence"}
          {!writable && ` · read-only. ${closedReason}`}
        </p>
      </div>

      <TimelineBuilder
        key={`${shownStage}-${version}`}
        stage={shownStage}
        initialEntries={entries}
        evidence={options}
        writable={writable}
        version={version}
      />

      {shownStage === "final" && initial.length > 0 && (
        <details className="rounded-xl border border-line p-4">
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
