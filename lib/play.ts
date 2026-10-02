import "server-only";
import { cache } from "react";
import { requireRole } from "@/lib/auth";
import { getEvent } from "@/lib/event";
import { effectiveExtraMinutes, openStage, teamDeadline } from "@/lib/phase";
import { letterToChoice } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { toQuestion, type CaseRow, type EvidenceRow, type Submission } from "@/lib/types";

/** Everything a team page needs. RLS decides what comes back. Cached per request. */
export const getPlayContext = cache(async function getPlayContext() {
  const session = await requireRole("team");
  const team = session.team!;
  const supabase = await createClient();
  const event = await getEvent();

  const [{ data: caseRow }, { data: evidence }, { data: tags }, { data: twist }, { data: subs }, { data: versions }] = await Promise.all([
    supabase.from("cases").select("id, code, title, briefing_md, root_cause_options").maybeSingle<CaseRow>(),
    supabase.from("evidence").select("id, case_id, code, title, content, is_twist, sort_order").order("sort_order").returns<EvidenceRow[]>(),
    supabase.from("evidence_tags").select("evidence_id, note").eq("team_id", team.id).returns<{ evidence_id: string; note: string }[]>(),
    supabase.from("case_twists").select("twist_md").maybeSingle<{ twist_md: string }>(),
    supabase.from("submissions").select("*").eq("team_id", team.id).returns<Submission[]>(),
    supabase.from("work_versions").select("doc, version").eq("team_id", team.id).returns<{ doc: string; version: number }[]>(),
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
  // - round-1 answers: until the official lock, even after the Initial
  //   Conclusion is submitted
  // - twist answers: until the Final Report is submitted
  const reportWritable = stage !== null && !timeUp && !reportLocked;
  const round1Writable = stage === "initial" && !timeUp && !officiallyLocked;
  const twistWritable = stage === "final" && reportWritable;

  const closedReason = !stage
    ? event?.phase === "initial_locked"
      ? "Round 1 is locked. Wait for the twist."
      : "Editing is closed in this phase."
    : timeUp
      ? "Time is up for this phase."
      : stage === "initial" && officiallyLocked
        ? "The organisers have locked round 1."
        : reportLocked
          ? stage === "initial"
            ? "Your Initial Conclusion is submitted and locked."
            : "You have submitted your Final Report, so everything is locked."
          : "";

  // The stage a team page shows: the open one, else the latest one.
  const shownStage = stage ?? (event?.twist_released_at ? "final" : "initial");

  const questions = (evidence ?? []).map(toQuestion);
  const answers: Record<string, number> = {};
  for (const t of tags ?? []) {
    const c = letterToChoice(t.note);
    if (c) answers[t.evidence_id] = c;
  }
  const round1 = questions.filter((q) => !q.twist);
  const twistQs = questions.filter((q) => q.twist);
  const answered = (qs: typeof questions) => qs.filter((q) => answers[q.id]).length;

  return {
    team,
    event,
    caseRow: caseRow ?? null,
    questions,
    answers,
    counts: { round1: round1.length, round1Answered: answered(round1), twist: twistQs.length, twistAnswered: answered(twistQs) },
    twistText: twist?.twist_md ?? null,
    submissions,
    versions: new Map((versions ?? []).map((v) => [v.doc, v.version])),
    stage,
    shownStage,
    round1Writable,
    twistWritable,
    /** the report of the open stage */
    reportWritable,
    /** Initial Conclusion submitted, round 1 still open */
    initialSubmitted: stage === "initial" && reportLocked && round1Writable,
    closedReason,
    timeUp,
  } as const;
});
