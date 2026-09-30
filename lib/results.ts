import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "@/lib/db";
import { judgePoints, scoreAuto, selectScoredAnswers, type KeyEvidence, type Tag } from "@/lib/scoring";

type EvidenceKeyRow = { id: string; code: string; case_id: string; is_twist: boolean; answer_evidence: { tag: Tag; timeline_pos: number | null } | null };

/** Compute and store auto_scores for every team that has a case. Returns count. */
export async function computeAutoScores(db: SupabaseClient): Promise<number> {
  // Every read pages through all rows: the API caps responses at 1,000 rows.
  const [teams, ev, answers, subs, tags, tl] = await Promise.all([
    selectAll<{ id: string; case_id: string | null }>((a, b) => db.from("teams").select("id, case_id").not("case_id", "is", null).order("id").range(a, b)),
    selectAll<EvidenceKeyRow>((a, b) => db.from("evidence").select("id, code, case_id, is_twist, answer_evidence(tag, timeline_pos)").order("id").range(a, b)),
    selectAll<{ case_id: string; post_twist_category: string }>((a, b) => db.from("answer_key").select("case_id, post_twist_category").order("case_id").range(a, b)),
    selectAll<{ team_id: string; stage: string; root_cause_category: string | null; key_evidence: string[] | null; tags_snapshot: Record<string, Tag> | null }>((a, b) =>
      db.from("submissions").select("team_id, stage, root_cause_category, key_evidence, tags_snapshot").order("team_id").order("stage").range(a, b),
    ),
    selectAll<{ team_id: string; evidence_id: string; tag: Tag | null }>((a, b) =>
      db.from("evidence_tags").select("team_id, evidence_id, tag").order("team_id").order("evidence_id").range(a, b),
    ),
    selectAll<{ team_id: string; stage: string; position: number; evidence_id: string | null }>((a, b) =>
      db.from("timeline_entries").select("team_id, stage, position, evidence_id").order("team_id").order("stage").order("position").range(a, b),
    ),
  ]);

  const codeOf = new Map(ev.map((e) => [e.id, e.code]));
  const keyByCase = new Map<string, KeyEvidence[]>();
  for (const e of ev ?? []) {
    if (!e.answer_evidence) continue;
    const list = keyByCase.get(e.case_id) ?? [];
    list.push({ id: e.code, tag: e.answer_evidence.tag, timeline_pos: e.answer_evidence.timeline_pos, twist: e.is_twist });
    keyByCase.set(e.case_id, list);
  }
  const postTwist = new Map(answers.map((a) => [a.case_id, a.post_twist_category as string]));

  const rows = teams.map((t) => {
    const initial = subs.find((s) => s.team_id === t.id && s.stage === "initial");
    const final = subs.find((s) => s.team_id === t.id && s.stage === "final");

    const liveTags: Record<string, Tag | null> = {};
    for (const x of tags.filter((x) => x.team_id === t.id)) liveTags[codeOf.get(x.evidence_id) ?? ""] = x.tag;
    const entries = tl.filter((x) => x.team_id === t.id);
    const codes = (stage: string) => entries.filter((x) => x.stage === stage).map((x) => (x.evidence_id ? (codeOf.get(x.evidence_id) ?? null) : null));

    const s = scoreAuto({
      key: keyByCase.get(t.case_id!) ?? [],
      postTwistCategory: postTwist.get(t.case_id!) ?? "",
      ...selectScoredAnswers({
        initialCategory: initial?.root_cause_category,
        finalCategory: final?.root_cause_category,
        finalTagsSnapshot: final?.tags_snapshot ?? null,
        liveTags,
        finalTimeline: codes("final"),
        initialTimeline: codes("initial"),
        initialCited: initial?.key_evidence ?? [],
        finalCited: final?.key_evidence ?? [],
      }),
    });
    return {
      team_id: t.id,
      tagging: s.tagging,
      timeline: s.timeline,
      hypothesis: s.hypothesis,
      root_cause: s.root_cause,
      evidence_support: s.evidence_support,
      computed_at: new Date().toISOString(),
    };
  });

  if (rows.length) {
    const { error } = await db.from("auto_scores").upsert(rows);
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

export type AutoRow = { tagging: number; timeline: number; hypothesis: number; root_cause: number; evidence_support: number; total: number };

export type LeaderRow = {
  id: string;
  team_code: string;
  name: string;
  institution: string | null;
  is_dummy: boolean;
  case_code: string | null;
  auto: AutoRow | null;
  judge: ReturnType<typeof judgePoints>;
  judgeCount: number;
  judgesAssigned: number;
  total: number;
  finalSubmittedAt: string | null;
  shortlist: { presentation_order: number | null } | null;
  rank: number;
};

export async function getLeaderboard(db: SupabaseClient): Promise<LeaderRow[]> {
  type TeamRow = { id: string; team_code: string; name: string; institution: string | null; is_dummy: boolean; cases: { code: string } | null };
  const [teams, autos, js, ja, sl, subs] = await Promise.all([
    selectAll<TeamRow>((a, b) => db.from("teams").select("id, team_code, name, institution, is_dummy, cases(code)").order("team_code").range(a, b)),
    selectAll<AutoRow & { team_id: string }>((a, b) =>
      db.from("auto_scores").select("*").order("team_id").range(a, b),
    ),
    selectAll<{ judge_id: string; team_id: string; criterion: string; score: number }>((a, b) =>
      db.from("judge_scores").select("judge_id, team_id, criterion, score").order("team_id").order("judge_id").order("criterion").range(a, b),
    ),
    selectAll<{ team_id: string }>((a, b) => db.from("judge_assignments").select("team_id").order("team_id").range(a, b)),
    selectAll<{ team_id: string; presentation_order: number | null }>((a, b) => db.from("shortlist").select("team_id, presentation_order").order("team_id").range(a, b)),
    selectAll<{ team_id: string; submitted_at: string | null }>((a, b) =>
      db.from("submissions").select("team_id, submitted_at").eq("stage", "final").order("team_id").range(a, b),
    ),
  ]);

  const rows: LeaderRow[] = teams.map((t) => {
    const a = autos.find((x) => x.team_id === t.id);
    const scores = js.filter((x) => x.team_id === t.id);
    const judge = judgePoints(scores);
    const auto = a
      ? {
          tagging: Number(a.tagging),
          timeline: Number(a.timeline),
          hypothesis: Number(a.hypothesis),
          root_cause: Number(a.root_cause),
          evidence_support: Number(a.evidence_support),
          total: Number(a.total),
        }
      : null;
    return {
      id: t.id,
      team_code: t.team_code,
      name: t.name,
      institution: t.institution,
      is_dummy: t.is_dummy,
      case_code: t.cases?.code ?? null,
      auto,
      judge,
      judgeCount: new Set(scores.map((s) => s.judge_id)).size,
      judgesAssigned: ja.filter((x) => x.team_id === t.id).length,
      total: Math.round(((auto?.total ?? 0) + judge.total) * 10) / 10,
      finalSubmittedAt: subs.find((s) => s.team_id === t.id)?.submitted_at ?? null,
      shortlist: sl.find((s) => s.team_id === t.id) ?? null,
      rank: 0,
    };
  });

  rows.sort(
    (x, y) =>
      y.total - x.total ||
      (x.finalSubmittedAt ?? "9999").localeCompare(y.finalSubmittedAt ?? "9999") ||
      x.team_code.localeCompare(y.team_code),
  );
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
