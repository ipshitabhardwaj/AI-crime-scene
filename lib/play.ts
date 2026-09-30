import "server-only";
import { cache } from "react";
import { requireRole } from "@/lib/auth";
import { getEvent } from "@/lib/event";
import { effectiveExtraMinutes, openStage, teamDeadline } from "@/lib/phase";
import { createClient } from "@/lib/supabase/server";
import type { CaseRow, EvidenceRow, Submission, TagRow } from "@/lib/types";

/** Everything a team page needs. RLS decides what comes back. Cached per request. */
export const getPlayContext = cache(async function getPlayContext() {
  const session = await requireRole("team");
  const team = session.team!;
  const supabase = await createClient();
  const event = await getEvent();

  const [{ data: caseRow }, { data: evidence }, { data: tags }, { data: twist }, { data: subs }, { data: versions }, { data: tlRows }] = await Promise.all([
    supabase.from("cases").select("id, code, title, briefing_md, root_cause_options").maybeSingle<CaseRow>(),
    supabase.from("evidence").select("*").order("sort_order").returns<EvidenceRow[]>(),
    supabase.from("evidence_tags").select("evidence_id, tag, note").eq("team_id", team.id).returns<TagRow[]>(),
    supabase.from("case_twists").select("twist_md").maybeSingle<{ twist_md: string }>(),
    supabase.from("submissions").select("*").eq("team_id", team.id).returns<Submission[]>(),
    supabase.from("work_versions").select("doc, version").eq("team_id", team.id).returns<{ doc: string; version: number }[]>(),
    supabase.from("timeline_entries").select("stage").eq("team_id", team.id).returns<{ stage: string }[]>(),
  ]);

  const stage = openStage(event?.phase);
  const deadline = teamDeadline(event?.phase_ends_at, effectiveExtraMinutes(team, event?.phase));
  const timeUp = deadline !== null && Date.now() >= deadline;
  const submissions = new Map((subs ?? []).map((s) => [s.stage, s]));
  const current = stage ? submissions.get(stage) : undefined;
  const reportLocked = current?.locked ?? false;
  const officiallyLocked = current?.admin_locked ?? false;

  // Same rules as the database (can_write / can_work, migration 0004):
  // - report: open phase, before the deadline, not submitted/locked
  // - tags + timeline: initial stage → until the official lock, even after the
  //   initial hypothesis is submitted; final stage → until the final report is submitted
  const reportWritable = stage !== null && !timeUp && !reportLocked;
  const workWritable = stage === "initial" ? !timeUp && !officiallyLocked : reportWritable;
  const writable = workWritable; // tags + timeline

  const closedReason = !stage
    ? event?.phase === "initial_locked"
      ? "Round 1 is locked (Initial Conclusion, tags and timeline). Wait for the next phase."
      : "Editing is closed in this phase."
    : timeUp
      ? "Time is up for this phase."
      : stage === "initial" && officiallyLocked
        ? "The organisers have locked round 1."
        : reportLocked
          ? stage === "initial"
            ? "Your Initial Conclusion is submitted and locked."
            : "You have submitted your final report, so everything is locked."
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
    /** tags + timeline */
    writable,
    /** the report of the open stage */
    reportWritable,
    /** initial hypothesis submitted, investigation still open */
    hypothesisSubmitted: stage === "initial" && reportLocked && workWritable,
    closedReason,
    timelineCount: (st: string) => (tlRows ?? []).filter((r) => r.stage === st).length,
    timeUp,
  } as const;
});
