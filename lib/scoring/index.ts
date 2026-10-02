/**
 * Automatic scoring (50 points). Pure functions, no database access, so they
 * can be unit-tested with `npm run test:scoring`.
 *
 *   Questions, round 1   24 = share of round-1 questions answered correctly
 *   Twist questions      12 = share of twist questions answered correctly
 *   Initial Conclusion    6 = named the real culprit already before the twist
 *   Final Report          8 = named the real culprit in the final report
 *
 * Judges (50): culprit 10 · reasoning 15 · use of clues 10 · presentation 15
 *
 * Fairness rule: round-1 answers are frozen at the lock. If a round-1 answer
 * was changed after the twist was released (the app never allows this, only a
 * hand-made request could), that question scores 0.
 */

/** One question of the answer key. `answer` is the correct option, 1–4. */
export type KeyQuestion = { code: string; answer: number; twist: boolean };

/** A team's answer to one question: the option picked (1–4) and when it was last saved. */
export type TeamAnswer = { choice: number | null; updatedAt?: string | null };

export type AutoInput = {
  key: KeyQuestion[];
  culprit: string;
  answers: Record<string, TeamAnswer | undefined>;
  twistReleasedAt?: string | null;
  initialCulprit: string | null | undefined;
  finalCulprit: string | null | undefined;
};

export type AutoScore = {
  /** questions, round 1 (stored in the auto_scores.tagging column) */
  tagging: number;
  /** twist questions (stored in the auto_scores.timeline column) */
  timeline: number;
  hypothesis: number;
  root_cause: number;
  /** not used by the quiz; always 0 */
  evidence_support: number;
  total: number;
};

export const POINTS = { round1: 24, twist: 12, hypothesis: 6, root_cause: 8 } as const;
export const MAX_AUTO = POINTS.round1 + POINTS.twist + POINTS.hypothesis + POINTS.root_cause; // 50

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Answers are saved as a letter: "A" = option 1 … "D" = option 4. */
export const LETTERS = ["A", "B", "C", "D"] as const;
export function choiceToLetter(choice: number): string {
  return LETTERS[choice - 1] ?? "";
}
export function letterToChoice(note: string | null | undefined): number | null {
  const i = LETTERS.indexOf(String(note ?? "").trim().toUpperCase() as (typeof LETTERS)[number]);
  return i >= 0 ? i + 1 : null;
}

/** How many questions of one round the team got right. */
export function countCorrect(i: Pick<AutoInput, "key" | "answers" | "twistReleasedAt">, twist: boolean): { correct: number; total: number } {
  const qs = i.key.filter((q) => q.twist === twist);
  const cutoff = i.twistReleasedAt ? new Date(i.twistReleasedAt).getTime() : null;
  let correct = 0;
  for (const q of qs) {
    const a = i.answers[q.code];
    if (!a || a.choice !== q.answer) continue;
    // round-1 answers must have been given before the twist was released
    if (!twist && cutoff !== null && a.updatedAt && new Date(a.updatedAt).getTime() > cutoff) continue;
    correct++;
  }
  return { correct, total: qs.length };
}

export function scoreAuto(i: AutoInput): AutoScore {
  const r1 = countCorrect(i, false);
  const tw = countCorrect(i, true);
  const tagging = r1.total ? round1((POINTS.round1 * r1.correct) / r1.total) : 0;
  const timeline = tw.total ? round1((POINTS.twist * tw.correct) / tw.total) : 0;
  const hypothesis = i.initialCulprit && i.initialCulprit === i.culprit ? POINTS.hypothesis : 0;
  // A team that never touched the final report keeps its Initial Conclusion.
  const finalCulprit = i.finalCulprit || i.initialCulprit || null;
  const root_cause = finalCulprit && finalCulprit === i.culprit ? POINTS.root_cause : 0;
  return { tagging, timeline, hypothesis, root_cause, evidence_support: 0, total: round1(tagging + timeline + hypothesis + root_cause) };
}

/** Judge criteria: each scored 0–10 by a judge, converted to points. */
export const JUDGE_CRITERIA = [
  { id: "responsible", label: "Right culprit, clearly named", points: 10, help: "Did they name who really did it, and say so clearly?" },
  { id: "reasoning", label: "Logical reasoning", points: 15, help: "Does the explanation make sense step by step?" },
  { id: "evidence_based", label: "Use of clues", points: 10, help: "Do they point to the clues that prove it?" },
  { id: "presentation", label: "Presentation", points: 15, help: "Scored during presentations (shortlist only)." },
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
  { id: "tagging", label: "Questions (round 1)", max: POINTS.round1 },
  { id: "timeline", label: "Twist questions", max: POINTS.twist },
  { id: "hypothesis", label: "Initial Conclusion", max: POINTS.hypothesis },
  { id: "root_cause", label: "Final Report", max: POINTS.root_cause },
] as const;
