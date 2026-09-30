/**
 * Automatic scoring (50 points). Pure functions, no database access, so they
 * can be unit-tested with `npm run test:scoring`. Every rule is derived from
 * the structure of the case answer keys: each case has ~11–12 relevant items
 * (the real chain + the clues that disprove the trap), 4 misleading items
 * (red herrings that support the trap), 2–3 irrelevant items (noise), a
 * 6–7 step key timeline, a trap category (pre-twist) and the real category.
 *
 *   Evidence analysis   15 = relevance 10 + red-herring detection 5
 *   Timeline            15 = coverage 6 + ordered coverage 9 − 2 per wrong event
 *   Initial hypothesis   6 = initial category already correct (before the twist)
 *   Root cause           8 = final category correct
 *   Evidence support     6 = final report cites pre-twist evidence that proves it
 *
 * Judges (50): responsible party 10 · reasoning 15 · evidence-based 10 · presentation 15
 *
 * Design goals (see docs/SCORING.md): blind strategies (tag everything the
 * same, random tags, a two-event timeline, copying the answer the twist
 * reveals) score low; reasoning before the twist is rewarded.
 */

export type Tag = "relevant" | "irrelevant" | "misleading";

/** One evidence item of the answer key. `twist` = released only at the twist. */
export type KeyEvidence = { id: string; tag: Tag; timeline_pos: number | null; twist?: boolean };

export type AutoInput = {
  key: KeyEvidence[];
  postTwistCategory: string;
  /** evidence code -> tag the team set (final state) */
  teamTags: Record<string, Tag | null | undefined>;
  /** evidence codes in the team's timeline order (entries without evidence are skipped) */
  teamTimeline: (string | null)[];
  initialCategory: string | null | undefined;
  finalCategory: string | null | undefined;
  /** evidence codes the team cited as key evidence in its conclusion */
  citedEvidence?: (string | null | undefined)[];
};

export type AutoScore = {
  tagging: number;
  timeline: number;
  hypothesis: number;
  root_cause: number;
  evidence_support: number;
  total: number;
};

export const POINTS = {
  relevance: 10,
  misleading: 5,
  tagging: 15,
  timelineCoverage: 6,
  timelineOrder: 9,
  timeline: 15,
  timelineWrongEventPenalty: 2,
  hypothesis: 6,
  root_cause: 8,
  evidence_support: 6,
  /** distinct relevant pre-twist items to cite for full evidence support */
  citationsRequired: 4,
  /** each cited misleading/irrelevant item cancels this many correct citations */
  wrongCitationWeight: 2,
} as const;

export const MAX_AUTO = POINTS.tagging + POINTS.timeline + POINTS.hypothesis + POINTS.root_cause + POINTS.evidence_support; // 50

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Evidence analysis (15).
 * Relevance (10) = 10 × max(0, TPR + TNR − 1)   (Youden's J; blind strategies score 0)
 *   TPR = relevant items tagged Relevant ÷ relevant items
 *   TNR = misleading/irrelevant items tagged Misleading or Irrelevant ÷ those items
 * Red herrings (5) = 5 × max(0, HIT − FALSE_ALARM)
 *   HIT = (misleading tagged Misleading + ½ × misleading tagged Irrelevant) ÷ misleading items
 *   FALSE_ALARM = (relevant tagged Misleading + ½ × relevant tagged Irrelevant) ÷ relevant items
 * Untagged items earn nothing. Tagging everything the same, or at random, earns ~0.
 */
export function scoreTaggingParts(key: KeyEvidence[], teamTags: AutoInput["teamTags"]) {
  const rel = key.filter((k) => k.tag === "relevant");
  const non = key.filter((k) => k.tag !== "relevant");
  const mis = key.filter((k) => k.tag === "misleading");
  const tagOf = (k: KeyEvidence) => teamTags[k.id] ?? null;
  if (key.length === 0) return { relevance: 0, misleading: 0 };

  const tpr = rel.length ? rel.filter((k) => tagOf(k) === "relevant").length / rel.length : 1;
  const tnr = non.length ? non.filter((k) => tagOf(k) === "misleading" || tagOf(k) === "irrelevant").length / non.length : 1;
  const relevance = POINTS.relevance * Math.max(0, tpr + tnr - 1);

  const hit = mis.length
    ? mis.reduce((s, k) => s + (tagOf(k) === "misleading" ? 1 : tagOf(k) === "irrelevant" ? 0.5 : 0), 0) / mis.length
    : 1;
  const falseAlarm = rel.length
    ? rel.reduce((s, k) => s + (tagOf(k) === "misleading" ? 1 : tagOf(k) === "irrelevant" ? 0.5 : 0), 0) / rel.length
    : 0;
  const misleading = POINTS.misleading * Math.max(0, hit - falseAlarm);
  return { relevance, misleading };
}

export function scoreTagging(key: KeyEvidence[], teamTags: AutoInput["teamTags"]): number {
  const p = scoreTaggingParts(key, teamTags);
  return round1(p.relevance + p.misleading);
}

/** Length of the longest strictly increasing subsequence. */
function lis(xs: number[]): number {
  const tails: number[] = [];
  for (const x of xs) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}

/**
 * Timeline (15) = 6 × COVERAGE + 9 × ORDERED − 2 × WRONG, floored at 0.
 *   COVERAGE = key events placed ÷ key events
 *   ORDERED  = longest run of placed key events in the correct relative order ÷ key events
 *   WRONG    = placed events whose evidence is keyed Misleading or Irrelevant
 * Relevant events that are not in the key timeline, and unknown codes, are
 * neutral (no gain, no loss).
 * Steps without evidence are ignored; a repeated item counts once (first position).
 */
export function scoreTimeline(key: KeyEvidence[], teamTimeline: (string | null)[]): number {
  const keyPos = new Map(key.filter((k) => k.timeline_pos !== null).map((k) => [k.id, k.timeline_pos as number]));
  if (keyPos.size === 0) return 0;
  const tagOf = new Map(key.map((k) => [k.id, k.tag]));

  const seen = new Set<string>();
  const team = teamTimeline.filter((id): id is string => !!id && !seen.has(id) && (seen.add(id), true));
  const hits = team.filter((id) => keyPos.has(id)).map((id) => keyPos.get(id)!);
  const wrong = team.filter((id) => tagOf.get(id) === "misleading" || tagOf.get(id) === "irrelevant").length;

  const coverage = hits.length / keyPos.size;
  const ordered = lis(hits) / keyPos.size;
  const raw = POINTS.timelineCoverage * coverage + POINTS.timelineOrder * ordered - POINTS.timelineWrongEventPenalty * wrong;
  return round1(Math.max(0, raw));
}

/** Initial hypothesis (6): the initial (pre-twist) category is already the real one. */
export function scoreHypothesis(initialCategory: string | null | undefined, postTwistCategory: string): number {
  return initialCategory && initialCategory === postTwistCategory ? POINTS.hypothesis : 0;
}

/** Root cause (8): the final category is the real one. */
export function scoreRootCause(finalCategory: string | null | undefined, postTwistCategory: string): number {
  return finalCategory && finalCategory === postTwistCategory ? POINTS.root_cause : 0;
}

/**
 * Evidence support (6), only when the final category is right:
 *   6 × clamp((GOOD − 2 × BAD) ÷ 4, 0, 1)
 *   GOOD = distinct cited items that are Relevant and were available BEFORE the twist
 *   BAD  = distinct cited items keyed Misleading or Irrelevant
 * Twist items and unknown codes are neutral: citing only the twist earns nothing,
 * and citing every item cancels itself out.
 */
export function scoreEvidenceSupport(
  key: KeyEvidence[],
  cited: AutoInput["citedEvidence"],
  finalCorrect: boolean,
): number {
  if (!finalCorrect || !cited?.length) return 0;
  const byId = new Map(key.map((k) => [k.id, k]));
  const ids = new Set(cited.filter((c): c is string => typeof c === "string" && c.length > 0));
  let good = 0;
  let bad = 0;
  for (const id of ids) {
    const k = byId.get(id);
    if (!k) continue;
    if (k.tag === "relevant" && !k.twist) good++;
    else if (k.tag !== "relevant") bad++;
  }
  const share = clamp01((good - POINTS.wrongCitationWeight * bad) / POINTS.citationsRequired);
  return round1(POINTS.evidence_support * share);
}

export function scoreAuto(i: AutoInput): AutoScore {
  const tagging = scoreTagging(i.key, i.teamTags);
  const timeline = scoreTimeline(i.key, i.teamTimeline);
  const hypothesis = scoreHypothesis(i.initialCategory, i.postTwistCategory);
  const root_cause = scoreRootCause(i.finalCategory, i.postTwistCategory);
  const evidence_support = scoreEvidenceSupport(i.key, i.citedEvidence, root_cause > 0);
  return {
    tagging,
    timeline,
    hypothesis,
    root_cause,
    evidence_support,
    total: round1(tagging + timeline + hypothesis + root_cause + evidence_support),
  };
}

/**
 * Which of a team's answers are scored (all keyed by evidence CODE):
 * - tags: the snapshot frozen when the final report was locked; if there is
 *   none, the live tags
 * - timeline: the final (post-twist) timeline; if it is empty, the initial one
 * - initial category: what the initial report said when it was locked (the hypothesis)
 * - final category: the final report's; if empty, the initial report's
 * - cited evidence: the final report's key evidence; if empty, the initial report's
 */
export function selectScoredAnswers(t: {
  initialCategory?: string | null;
  finalCategory?: string | null;
  finalTagsSnapshot?: Record<string, Tag> | null;
  liveTags: Record<string, Tag | null | undefined>;
  finalTimeline: (string | null)[];
  initialTimeline: (string | null)[];
  initialCited?: string[] | null;
  finalCited?: string[] | null;
}) {
  return {
    teamTags: t.finalTagsSnapshot ?? t.liveTags,
    teamTimeline: t.finalTimeline.length ? t.finalTimeline : t.initialTimeline,
    initialCategory: t.initialCategory ?? null,
    finalCategory: t.finalCategory || t.initialCategory || null,
    citedEvidence: t.finalCited?.length ? t.finalCited : (t.initialCited ?? []),
  };
}

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

/** Labels for the auto-score breakdown (admin, judge and export views). */
export const AUTO_PARTS = [
  { id: "tagging", label: "Evidence analysis", max: POINTS.tagging },
  { id: "timeline", label: "Timeline", max: POINTS.timeline },
  { id: "hypothesis", label: "Initial Conclusion", max: POINTS.hypothesis },
  { id: "root_cause", label: "Root cause", max: POINTS.root_cause },
  { id: "evidence_support", label: "Evidence support", max: POINTS.evidence_support },
] as const;
