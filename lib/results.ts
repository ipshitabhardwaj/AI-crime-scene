import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "@/lib/db";
import { countCorrect, judgePoints, letterToChoice, scoreAuto, type KeyQuestion, type TeamAnswer } from "@/lib/scoring";

type QuestionKeyRow = { id: string; code: string; case_id: string; is_twist: boolean; answer_evidence: { timeline_pos: number | null } | null };

/** Compute and store auto_scores for every team that has a case. Returns count. */
export async function computeAutoScores(db: SupabaseClient): Promise<number> {
  // Every read pages through all rows: the API caps responses at 1,000 rows.
  const [{ data: event }, teams, ev, answers, subs, tags] = await Promise.all([
    db.from("event").select("twist_released_at").eq("id", 1).maybeSingle<{ twist_released_at: string | null }>(),
    selectAll<{ id: string; case_id: string | null }>((a, b) => db.from("teams").select("id, case_id").not("case_id", "is", null).order("id").range(a, b)),
    selectAll<QuestionKeyRow>((a, b) => db.from("evidence").select("id, code, case_id, is_twist, answer_evidence(timeline_pos)").order("id").range(a, b)),
    selectAll<{ case_id: string; post_twist_category: string }>((a, b) => db.from("answer_key").select("case_id, post_twist_category").order("case_id").range(a, b)),
    selectAll<{ team_id: string; stage: string; root_cause_category: string | null }>((a, b) =>
      db.from("submissions").select("team_id, stage, root_cause_category").order("team_id").order("stage").range(a, b),
    ),
    selectAll<{ team_id: string; evidence_id: string; note: string; updated_at: string }>((a, b) =>
      db.from("evidence_tags").select("team_id, evidence_id, note, updated_at").order("team_id").order("evidence_id").range(a, b),
    ),
  ]);

  const codeOf = new Map(ev.map((e) => [e.id, e.code]));
  const keyByCase = new Map<string, KeyQuestion[]>();
  for (const e of ev) {
    if (!e.answer_evidence?.timeline_pos) continue;
    const list = keyByCase.get(e.case_id) ?? [];
    list.push({ code: e.code, answer: e.answer_evidence.timeline_pos, twist: e.is_twist });
    keyByCase.set(e.case_id, list);
  }
  const culprit = new Map(answers.map((a) => [a.case_id, a.post_twist_category]));
  const tagsByTeam = new Map<string, typeof tags>();
  for (const t of tags) {
    const list = tagsByTeam.get(t.team_id) ?? [];
    list.push(t);
    tagsByTeam.set(t.team_id, list);
  }

  const rows = teams.map((t) => {
    const initial = subs.find((s) => s.team_id === t.id && s.stage === "initial");
    const final = subs.find((s) => s.team_id === t.id && s.stage === "final");
    const teamAnswers: Record<string, TeamAnswer> = {};
    for (const x of tagsByTeam.get(t.id) ?? []) teamAnswers[codeOf.get(x.evidence_id) ?? ""] = { choice: letterToChoice(x.note), updatedAt: x.updated_at };

    const s = scoreAuto({
      key: keyByCase.get(t.case_id!) ?? [],
      culprit: culprit.get(t.case_id!) ?? "",
      answers: teamAnswers,
      twistReleasedAt: event?.twist_released_at ?? null,
      initialCulprit: initial?.root_cause_category,
      finalCulprit: final?.root_cause_category,
    });
    return {
      team_id: t.id,
      tagging: s.tagging,
      timeline: s.timeline,
      hypothesis: s.hypothesis,
      root_cause: s.root_cause,
      evidence_support: 0,
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

/** One question on a team's own score card: answered or not, right or wrong. Never the correct option itself. */
export type AnswerMark = { code: string; twist: boolean; answered: boolean; correct: boolean };

/**
 * A team's answers marked right/wrong, with the same rule as the auto-score
 * (a round-1 answer changed after the twist counts as wrong). Needs a
 * service-role client; call it only once the results are revealed.
 */
export async function getTeamAnswerMarks(db: SupabaseClient, teamId: string, caseId: string): Promise<AnswerMark[]> {
  const [{ data: event }, { data: ev }, { data: tags }] = await Promise.all([
    db.from("event").select("twist_released_at").eq("id", 1).maybeSingle<{ twist_released_at: string | null }>(),
    db.from("evidence").select("id, code, case_id, is_twist, answer_evidence(timeline_pos)").eq("case_id", caseId).order("sort_order").returns<QuestionKeyRow[]>(),
    db.from("evidence_tags").select("evidence_id, note, updated_at").eq("team_id", teamId).returns<{ evidence_id: string; note: string; updated_at: string }[]>(),
  ]);
  const byQuestion = new Map((tags ?? []).map((t) => [t.evidence_id, t]));
  return (ev ?? []).map((q) => {
    const t = byQuestion.get(q.id);
    const choice = letterToChoice(t?.note);
    const answer = q.answer_evidence?.timeline_pos ?? 0;
    const { correct } = countCorrect(
      { key: [{ code: q.code, answer, twist: q.is_twist }], answers: { [q.code]: { choice, updatedAt: t?.updated_at } }, twistReleasedAt: event?.twist_released_at ?? null },
      q.is_twist,
    );
    return { code: q.code, twist: q.is_twist, answered: choice !== null, correct: correct === 1 };
  });
}
