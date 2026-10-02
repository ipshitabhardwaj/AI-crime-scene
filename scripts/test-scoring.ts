/**
 * Scoring tests (no database):  npm run test:scoring
 */
import assert from "node:assert/strict";
import { MAX_AUTO, POINTS, choiceToLetter, countCorrect, judgePoints, letterToChoice, scoreAuto, type KeyQuestion, type TeamAnswer } from "../lib/scoring";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  if (process.env.VERBOSE) console.log("  ✓", name);
};

// 8 round-1 questions + 3 twist questions, like the event cases
const key: KeyQuestion[] = [
  ...[3, 1, 4, 2, 4, 2, 3, 1].map((answer, i) => ({ code: `Q${i + 1}`, answer, twist: false })),
  ...[3, 2, 1].map((answer, i) => ({ code: `T${i + 1}`, answer, twist: true })),
];
const CULPRIT = "Bablu";
const TRAP = "Rohan";
const before = "2026-10-10T10:00:00Z";
const twistAt = "2026-10-10T11:00:00Z";
const after = "2026-10-10T11:10:00Z";
const all = (pick: (q: KeyQuestion) => number | null, at: (q: KeyQuestion) => string = (q) => (q.twist ? after : before)) =>
  Object.fromEntries(key.map((q) => [q.code, { choice: pick(q), updatedAt: at(q) } as TeamAnswer]));
const base = { key, culprit: CULPRIT, twistReleasedAt: twistAt };

test("maximum is 50", () => assert.equal(MAX_AUTO, 50));

test("a perfect team scores exactly 50", () => {
  const s = scoreAuto({ ...base, answers: all((q) => q.answer), initialCulprit: CULPRIT, finalCulprit: CULPRIT });
  assert.deepEqual(s, { tagging: 24, timeline: 12, hypothesis: 6, root_cause: 8, evidence_support: 0, total: 50 });
});

test("a team that did nothing scores 0", () => {
  const s = scoreAuto({ ...base, answers: {}, initialCulprit: null, finalCulprit: null });
  assert.equal(s.total, 0);
});

test("typical team: fell for the trap first, corrected after the twist", () => {
  const s = scoreAuto({ ...base, answers: all((q) => q.answer), initialCulprit: TRAP, finalCulprit: CULPRIT });
  assert.equal(s.hypothesis, 0);
  assert.equal(s.root_cause, 8);
  assert.equal(s.total, 44);
});

test("each round-1 question is worth 3, each twist question 4", () => {
  const one = scoreAuto({ ...base, answers: { Q1: { choice: 3, updatedAt: before } }, initialCulprit: null, finalCulprit: null });
  assert.equal(one.tagging, POINTS.round1 / 8);
  const tw = scoreAuto({ ...base, answers: { T1: { choice: 3, updatedAt: after } }, initialCulprit: null, finalCulprit: null });
  assert.equal(tw.timeline, POINTS.twist / 3);
});

test("wrong answers score nothing, there is no negative marking", () => {
  const s = scoreAuto({ ...base, answers: all((q) => (q.answer % 4) + 1), initialCulprit: TRAP, finalCulprit: TRAP });
  assert.equal(s.total, 0);
});

test("unanswered questions (null choice) score nothing", () => {
  const s = scoreAuto({ ...base, answers: all(() => null), initialCulprit: null, finalCulprit: null });
  assert.equal(s.total, 0);
});

test("always picking the same option scores about a quarter of the questions", () => {
  for (const pick of [1, 2, 3, 4]) {
    const s = scoreAuto({ ...base, answers: all(() => pick), initialCulprit: null, finalCulprit: null });
    assert.ok(s.tagging <= 6 && s.timeline <= 4, `option ${pick}: ${s.tagging}/${s.timeline}`);
  }
});

test("a round-1 answer changed after the twist does not count", () => {
  const answers = all((q) => q.answer, () => after); // everything saved after the twist
  const s = scoreAuto({ ...base, answers, initialCulprit: null, finalCulprit: null });
  assert.equal(s.tagging, 0);
  assert.equal(s.timeline, 12); // twist answers are meant to be given after the twist
});

test("before the twist is released, round-1 answers count normally", () => {
  const s = scoreAuto({ ...base, twistReleasedAt: null, answers: all((q) => q.answer, () => after), initialCulprit: null, finalCulprit: null });
  assert.equal(s.tagging, 24);
});

test("answers saved exactly at the twist time still count", () => {
  const c = countCorrect({ key, twistReleasedAt: twistAt, answers: all((q) => q.answer, () => twistAt) }, false);
  assert.deepEqual(c, { correct: 8, total: 8 });
});

test("no final report: the Initial Conclusion is used for the final answer", () => {
  const s = scoreAuto({ ...base, answers: {}, initialCulprit: CULPRIT, finalCulprit: null });
  assert.equal(s.hypothesis, 6);
  assert.equal(s.root_cause, 8);
});

test("changing a right Initial Conclusion to a wrong final answer loses the 8", () => {
  const s = scoreAuto({ ...base, answers: {}, initialCulprit: CULPRIT, finalCulprit: TRAP });
  assert.equal(s.hypothesis, 6);
  assert.equal(s.root_cause, 0);
});

test("answers for unknown question codes are ignored", () => {
  const s = scoreAuto({ ...base, answers: { Q99: { choice: 1, updatedAt: before } }, initialCulprit: null, finalCulprit: null });
  assert.equal(s.total, 0);
});

test("a case with no twist questions gives 0 for that part, not NaN", () => {
  const s = scoreAuto({ key: key.filter((q) => !q.twist), culprit: CULPRIT, answers: all((q) => q.answer), initialCulprit: null, finalCulprit: null });
  assert.equal(s.timeline, 0);
  assert.equal(s.tagging, 24);
});

test("letters and choices convert both ways; junk is ignored", () => {
  assert.equal(choiceToLetter(1), "A");
  assert.equal(choiceToLetter(4), "D");
  assert.equal(letterToChoice("c"), 3);
  assert.equal(letterToChoice(" B "), 2);
  for (const junk of ["", "E", "AB", null, undefined, "1"]) assert.equal(letterToChoice(junk), null);
});

test("scores are rounded to one decimal", () => {
  const k: KeyQuestion[] = [1, 2, 3, 4, 1, 2, 3].map((answer, i) => ({ code: `Q${i}`, answer, twist: false }));
  const s = scoreAuto({ key: k, culprit: CULPRIT, answers: { Q0: { choice: 1 } }, initialCulprit: null, finalCulprit: null });
  assert.equal(s.tagging, 3.4); // 24/7
});

test("judge points: averaged per criterion, weighted 10/15/10/15", () => {
  const j = judgePoints([
    { criterion: "responsible", score: 10 },
    { criterion: "reasoning", score: 8 },
    { criterion: "reasoning", score: 6 },
    { criterion: "evidence_based", score: 5 },
    { criterion: "presentation", score: 10 },
  ]);
  assert.deepEqual(j, { responsible: 10, reasoning: 10.5, evidence_based: 5, presentation: 15, total: 40.5 });
  assert.equal(judgePoints([]).total, 0);
});

console.log(`scoring tests passed (${passed} tests)`);
