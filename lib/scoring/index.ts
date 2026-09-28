/**
 * Scoring rules (see the build plan). Pure functions, no database access,
 * so they can be unit-tested with `npm run test:scoring`.
 *
 * Auto (50):   tagging 15 · timeline 15 · root cause category 10 · adaptability 10
 * Judges (50): responsible party 10 · reasoning 15 · evidence-based 10 · presentation 15
 */

export type Tag = "relevant" | "irrelevant" | "misleading";

export type KeyEvidence = { id: string; tag: Tag; timeline_pos: number | null };

export type AutoInput = {
  key: KeyEvidence[];
  postTwistCategory: string;
  /** evidence_id -> tag the team set (final state) */
  teamTags: Record<string, Tag | null | undefined>;
  /** evidence ids in the team's final timeline order (entries without evidence are skipped) */
  teamTimeline: (string | null)[];
  initialCategory: string | null | undefined;
  finalCategory: string | null | undefined;
};

export type AutoScore = { tagging: number; timeline: number; root_cause: number; adaptability: number; total: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scoreTagging(key: KeyEvidence[], teamTags: AutoInput["teamTags"]): number {
  if (key.length === 0) return 0;
  const correct = key.filter((k) => teamTags[k.id] === k.tag).length;
  return round1((15 * correct) / key.length);
}

/** 15 × (0.5·F1(chosen events vs key events) + 0.5·share of correctly ordered pairs) */
export function scoreTimeline(key: KeyEvidence[], teamTimeline: (string | null)[]): number {
  const keyPos = new Map(key.filter((k) => k.timeline_pos !== null).map((k) => [k.id, k.timeline_pos as number]));
  if (keyPos.size === 0) return 0;

  const seen = new Set<string>();
  const team = teamTimeline.filter((id): id is string => !!id && !seen.has(id) && (seen.add(id), true));
  if (team.length === 0) return 0;

  const hits = team.filter((id) => keyPos.has(id));
  const precision = hits.length / team.length;
  const recall = hits.length / keyPos.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  // Share of correctly ordered pairs among the key events the team placed.
  // Fewer than two such events means there is no order to judge: 0.
  let order: number;
  if (hits.length < 2) order = 0;
  else {
    let good = 0;
    let pairs = 0;
    for (let i = 0; i < hits.length; i++) {
      for (let j = i + 1; j < hits.length; j++) {
        pairs++;
        if (keyPos.get(hits[i])! < keyPos.get(hits[j])!) good++;
      }
    }
    order = good / pairs;
  }
  return round1(15 * (0.5 * f1 + 0.5 * order));
}

export function scoreRootCause(finalCategory: string | null | undefined, postTwistCategory: string): number {
  return finalCategory && finalCategory === postTwistCategory ? 10 : 0;
}

/** 10 if the final answer is right; 3 if wrong but changed after the twist; else 0. */
export function scoreAdaptability(
  initialCategory: string | null | undefined,
  finalCategory: string | null | undefined,
  postTwistCategory: string,
): number {
  if (finalCategory && finalCategory === postTwistCategory) return 10;
  if (finalCategory && finalCategory !== initialCategory) return 3;
  return 0;
}

export function scoreAuto(i: AutoInput): AutoScore {
  const tagging = scoreTagging(i.key, i.teamTags);
  const timeline = scoreTimeline(i.key, i.teamTimeline);
  const root_cause = scoreRootCause(i.finalCategory, i.postTwistCategory);
  const adaptability = scoreAdaptability(i.initialCategory, i.finalCategory, i.postTwistCategory);
  return { tagging, timeline, root_cause, adaptability, total: round1(tagging + timeline + root_cause + adaptability) };
}

/**
 * Which of a team's answers are scored (all keyed by evidence CODE):
 * - tags: the snapshot frozen when the final report was locked; if there is
 *   none, the live tags
 * - timeline: the final (post-twist) timeline; if it is empty, the initial one
 * - final category: the final report's; if empty, the initial report's
 */
export function selectScoredAnswers(t: {
  initialCategory?: string | null;
  finalCategory?: string | null;
  finalTagsSnapshot?: Record<string, Tag> | null;
  liveTags: Record<string, Tag | null | undefined>;
  finalTimeline: (string | null)[];
  initialTimeline: (string | null)[];
}) {
  return {
    teamTags: t.finalTagsSnapshot ?? t.liveTags,
    teamTimeline: t.finalTimeline.length ? t.finalTimeline : t.initialTimeline,
    initialCategory: t.initialCategory ?? null,
    finalCategory: t.finalCategory || t.initialCategory || null,
  };
}

export const MAX_AUTO = 50;

/** Judge criteria: each scored 0–10 by a judge, converted to points. */
export const JUDGE_CRITERIA = [
  { id: "responsible", label: "Responsible party identified", points: 10, help: "Did they name the right component / person / system?" },
  { id: "reasoning", label: "Logical reasoning", points: 15, help: "Is the chain of reasoning sound and consistent?" },
  { id: "evidence_based", label: "Evidence-based conclusion", points: 10, help: "Does every claim cite the right evidence?" },
  { id: "presentation", label: "Final report & presentation", points: 15, help: "Scored during presentations (shortlist only)." },
] as const;

export type JudgeCriterion = (typeof JUDGE_CRITERIA)[number]["id"];

/** Average each criterion across judges (0–10) and convert to points. */
export function judgePoints(scores: { criterion: string; score: number }[]) {
  const byCrit: Record<string, number[]> = {};
  for (const s of scores) (byCrit[s.criterion] ??= []).push(Number(s.score));
  const out: Record<JudgeCriterion, number> = { responsible: 0, reasoning: 0, evidence_based: 0, presentation: 0 };
  for (const c of JUDGE_CRITERIA) {
    const arr = byCrit[c.id];
    if (arr?.length) out[c.id] = round1((arr.reduce((a, b) => a + b, 0) / arr.length / 10) * c.points);
  }
  const total = round1(Object.values(out).reduce((a, b) => a + b, 0));
  return { ...out, total };
}
