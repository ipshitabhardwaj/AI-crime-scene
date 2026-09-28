import "server-only";
import { requireRole } from "@/lib/auth";
import { getEvent } from "@/lib/event";
import { openStage, teamDeadline } from "@/lib/phase";
import { createClient } from "@/lib/supabase/server";
import type { CaseRow, EvidenceRow, Submission, TagRow } from "@/lib/types";

/** Everything a team page needs. RLS decides what comes back. */
export async function getPlayContext() {
  const session = await requireRole("team");
  const team = session.team!;
  const supabase = await createClient();
  const event = await getEvent();

  const [{ data: caseRow }, { data: evidence }, { data: tags }, { data: twist }, { data: subs }, { data: versions }] = await Promise.all([
    supabase.from("cases").select("id, code, title, briefing_md, root_cause_options").maybeSingle<CaseRow>(),
    supabase.from("evidence").select("*").order("sort_order").returns<EvidenceRow[]>(),
    supabase.from("evidence_tags").select("evidence_id, tag, note").eq("team_id", team.id).returns<TagRow[]>(),
    supabase.from("case_twists").select("twist_md").maybeSingle<{ twist_md: string }>(),
    supabase.from("submissions").select("*").eq("team_id", team.id).returns<Submission[]>(),
    supabase.from("work_versions").select("doc, version").eq("team_id", team.id).returns<{ doc: string; version: number }[]>(),
  ]);

  const stage = openStage(event?.phase);
  const deadline = teamDeadline(event?.phase_ends_at, team.extra_minutes);
  const timeUp = deadline !== null && Date.now() >= deadline;
  const submissions = new Map((subs ?? []).map((s) => [s.stage, s]));
  const stageLocked = stage ? (submissions.get(stage)?.locked ?? false) : false;
  const writable = stage !== null && !timeUp && !stageLocked;

  const closedReason = !stage
    ? event?.phase === "initial_locked"
      ? "Initial answers are locked. Wait for the next phase."
      : "Editing is closed in this phase."
    : timeUp
      ? "Time is up for this phase."
      : stageLocked
        ? "You have submitted, so this is locked until the next phase."
        : "";

  // The stage a team page shows: the open one, else the latest one.
  const shownStage = stage ?? (event?.twist_released_at ? "final" : "initial");

  return {
    team,
    event,
    caseRow: caseRow ?? null,
    evidence: evidence ?? [],
    tags: new Map((tags ?? []).map((t) => [t.evidence_id, t])),
    twistText: twist?.twist_md ?? null,
    submissions,
    versions: new Map((versions ?? []).map((v) => [v.doc, v.version])),
    stage,
    shownStage,
    writable,
    closedReason,
  } as const;
}
