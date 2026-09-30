/**
 * Scoring tests.  npm run test:scoring
 *
 * 1. Unit tests of every rule with hand-computed expected values.
 * 2. For EVERY case file in /cases: perfect, completely wrong, random tagging,
 *    everything-relevant, trap hypothesis, correct before the twist, correct
 *    only after the twist, copying the twist without reasoning, partial and
 *    tiny timelines, dumping every timestamped item, citing everything,
 *    empty, duplicate and malformed submissions.
 * 3. A randomized check that no input can push a score outside its range.
 * (Deadline, duplicate-submit and lock behaviour live in the database and
 * are tested by supabase/tests/security_checks.sql.)
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseFileSchema } from "../lib/cases/schema";
import {
  MAX_AUTO,
  POINTS,
  judgePoints,
  scoreAuto,
  scoreEvidenceSupport,
  scoreHypothesis,
  scoreRootCause,
  scoreTagging,
  scoreTimeline,
  selectScoredAnswers,
  type KeyEvidence,
  type Tag,
} from "../lib/scoring";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  if (process.env.VERBOSE) console.log("  ✓", name);
};

// ---------------------------------------------------------------- 1. rules
// a, b, c: key timeline; d: relevant but not in the timeline; t: twist item (timeline #4);
// m1, m2: misleading; i1: irrelevant.
const key: KeyEvidence[] = [
  { id: "a", tag: "relevant", timeline_pos: 1 },
  { id: "b", tag: "relevant", timeline_pos: 2 },
  { id: "c", tag: "relevant", timeline_pos: 3 },
  { id: "d", tag: "relevant", timeline_pos: null },
  { id: "t", tag: "relevant", timeline_pos: 4, twist: true },
  { id: "m1", tag: "misleading", timeline_pos: null },
  { id: "m2", tag: "misleading", timeline_pos: null },
  { id: "i1", tag: "irrelevant", timeline_pos: null },
];
const perfectTags = Object.fromEntries(key.map((k) => [k.id, k.tag])) as Record<string, Tag>;
const allAs = (t: Tag) => Object.fromEntries(key.map((k) => [k.id, t])) as Record<string, Tag>;

test("MAX_AUTO is exactly 50", () => assert.equal(MAX_AUTO, 50));

test("tagging: perfect 15; blind strategies 0; partial values hand-computed", () => {
  assert.equal(scoreTagging(key, perfectTags), 15);
  assert.equal(scoreTagging(key, {}), 0);
  assert.equal(scoreTagging(key, allAs("relevant")), 0); // TPR 1 + TNR 0 − 1 = 0; no red herrings found
  assert.equal(scoreTagging(key, allAs("misleading")), 0); // relevance 0; HIT 1 − FALSE_ALARM 1 = 0
  assert.equal(scoreTagging(key, allAs("irrelevant")), 0); // relevance 0; HIT ½ − FALSE_ALARM ½ = 0
  assert.equal(scoreTagging(key, { ...perfectTags, m1: "irrelevant" }), 13.8); // 10 + 5 × 0.75 = 13.75
  assert.equal(scoreTagging(key, { ...perfectTags, d: null }), 13); // 10 × 0.8 + 5
  assert.equal(scoreTagging(key, { ...perfectTags, m1: "relevant" }), 9.2); // 10 × ⅔ + 5 × ½ = 9.17
  assert.equal(scoreTagging(key, { ...perfectTags, i1: "misleading" }), 15); // misleading/irrelevant confusion on noise is free
  assert.equal(scoreTagging([], {}), 0);
});

test("timeline: coverage 6 + ordered coverage 9 − 2 per wrong event", () => {
  assert.equal(scoreTimeline(key, ["a", "b", "c", "t"]), 15);
  assert.equal(scoreTimeline(key, ["t", "c", "b", "a"]), 8.3); // 6 + 9 × ¼
  assert.equal(scoreTimeline(key, ["b", "a", "c", "t"]), 12.8); // 6 + 9 × ¾
  assert.equal(scoreTimeline(key, ["a", "b"]), 7.5); // 6 × ½ + 9 × ½
  assert.equal(scoreTimeline(key, ["a"]), 3.8); // 1.5 + 2.25
  assert.equal(scoreTimeline(key, ["a", "b", "c", "t", "m1"]), 13); // one red herring −2
  assert.equal(scoreTimeline(key, ["a", "b", "c", "t", "d"]), 15); // relevant non-key event is neutral
  assert.equal(scoreTimeline(key, ["a", null, "a", "b", "c", "t"]), 15); // duplicates / empty steps ignored
  assert.equal(scoreTimeline(key, ["m1", "i1"]), 0); // floored at 0
  assert.equal(scoreTimeline(key, []), 0);
});

test("hypothesis 6 and root cause 8: exact category match only", () => {
  assert.equal(scoreHypothesis("Y", "Y"), 6);
  assert.equal(scoreHypothesis("X", "Y"), 0);
  assert.equal(scoreHypothesis(null, "Y"), 0);
  assert.equal(scoreRootCause("Y", "Y"), 8);
  assert.equal(scoreRootCause("y", "Y"), 0);
  assert.equal(scoreRootCause(undefined, "Y"), 0);
});

test("evidence support: pre-twist relevant citations, misleading ones count double against", () => {
  assert.equal(scoreEvidenceSupport(key, ["a", "b", "c", "d"], true), 6);
  assert.equal(scoreEvidenceSupport(key, ["a", "b", "c"], true), 4.5);
  assert.equal(scoreEvidenceSupport(key, ["a", "b", "c", "d", "m1"], true), 3); // (4 − 2) / 4
  assert.equal(scoreEvidenceSupport(key, ["t"], true), 0); // twist item only: no credit
  assert.equal(scoreEvidenceSupport(key, key.map((k) => k.id), true), 0); // cite everything: 4 − 2 × 3 < 0
  assert.equal(scoreEvidenceSupport(key, ["a", "b", "c", "d"], false), 0); // wrong conclusion: no support points
  assert.equal(scoreEvidenceSupport(key, ["a", "a", "a", "a"], true), 1.5); // duplicates count once
  assert.equal(scoreEvidenceSupport(key, ["ZZ", "", null], true), 0);
});

test("judge points: averaged per criterion, weighted, capped by the 0–10 scale", () => {
  const j = judgePoints([
    { criterion: "reasoning", score: 8 },
    { criterion: "reasoning", score: 6 },
    { criterion: "responsible", score: 10 },
    { criterion: "presentation", score: 5 },
  ]);
  assert.deepEqual([j.reasoning, j.responsible, j.evidence_based, j.presentation, j.total], [10.5, 10, 0, 7.5, 28]);
  const max = judgePoints(["responsible", "reasoning", "evidence_based", "presentation"].map((c) => ({ criterion: c, score: 10 })));
  assert.equal(max.total, 50);
  assert.equal(judgePoints([]).total, 0);
  assert.equal(judgePoints([{ criterion: "unknown", score: 10 }]).total, 0);
});

test("selectScoredAnswers: snapshot beats live tags; final timeline/category/citations fall back to initial", () => {
  const r = selectScoredAnswers({
    initialCategory: "X",
    finalCategory: null,
    finalTagsSnapshot: { a: "relevant" },
    liveTags: { a: "misleading" },
    finalTimeline: [],
    initialTimeline: ["a"],
    initialCited: ["a"],
    finalCited: [],
  });
  assert.deepEqual(r, { teamTags: { a: "relevant" }, teamTimeline: ["a"], initialCategory: "X", finalCategory: "X", citedEvidence: ["a"] });
  const r2 = selectScoredAnswers({ finalCategory: "Y", liveTags: { a: "irrelevant" }, finalTimeline: ["b"], initialTimeline: ["a"], finalCited: ["b"] });
  assert.deepEqual(r2, { teamTags: { a: "irrelevant" }, teamTimeline: ["b"], initialCategory: null, finalCategory: "Y", citedEvidence: ["b"] });
});

// ---------------------------------------------------------- 2. every case
const dir = join(process.cwd(), "cases");
const report: string[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const c = CaseFileSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
  const k: KeyEvidence[] = c.evidence.map((e) => ({ id: e.code, tag: e.key.tag, timeline_pos: e.key.timeline_pos, twist: e.is_twist }));
  const right = Object.fromEntries(k.map((x) => [x.id, x.tag])) as Record<string, Tag>;
  const all = (t: Tag) => Object.fromEntries(k.map((x) => [x.id, t])) as Record<string, Tag>;
  const order = k.filter((x) => x.timeline_pos).sort((a, b) => a.timeline_pos! - b.timeline_pos!).map((x) => x.id);
  const clues = k.filter((x) => x.tag === "relevant" && !x.twist).map((x) => x.id);
  const twistItems = k.filter((x) => x.twist).map((x) => x.id);
  const timedWrong = c.evidence.filter((e) => e.key.tag !== "relevant" && e.time_label).map((e) => e.code);
  const trap = c.answer.root_cause_category;
  const answer = c.answer.post_twist_category;
  const other = c.root_cause_options.find((o) => o !== trap && o !== answer)!;
  const wrongTag = (t: Tag): Tag => (t === "relevant" ? "misleading" : t === "misleading" ? "irrelevant" : "relevant");
  const run = (o: Partial<Parameters<typeof scoreAuto>[0]>) =>
    scoreAuto({ key: k, postTwistCategory: answer, teamTags: {}, teamTimeline: [], initialCategory: null, finalCategory: null, citedEvidence: [], ...o });

  // deterministic pseudo-random tagging
  let seed = 1234;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const tagsList: Tag[] = ["relevant", "irrelevant", "misleading"];
  const randomScores: number[] = [];
  for (let i = 0; i < 2000; i++) {
    randomScores.push(scoreTagging(k, Object.fromEntries(k.map((x) => [x.id, tagsList[Math.floor(rnd() * 3)]]))));
  }
  randomScores.sort((a, b) => a - b);
  const randomAvg = Math.round((randomScores.reduce((a, b) => a + b, 0) / randomScores.length) * 10) / 10;
  const randomP95 = randomScores[Math.floor(randomScores.length * 0.95)];

  const good = { teamTags: right, teamTimeline: order, citedEvidence: clues.slice(0, 5) };
  const s = {
    perfect: run({ ...good, initialCategory: answer, finalCategory: answer }),
    correctAfterTwistOnly: run({ ...good, initialCategory: trap, finalCategory: answer }),
    wrong: run({
      teamTags: Object.fromEntries(k.map((x) => [x.id, wrongTag(x.tag)])),
      teamTimeline: k.filter((x) => !x.timeline_pos && x.tag !== "relevant").map((x) => x.id),
      initialCategory: other,
      finalCategory: other,
      citedEvidence: k.filter((x) => x.tag !== "relevant").map((x) => x.id),
    }),
    allRelevant: run({ teamTags: all("relevant") }),
    twistCopy: run({ teamTags: all("relevant"), teamTimeline: order.slice(0, 2), initialCategory: trap, finalCategory: answer, citedEvidence: twistItems }),
    trap: run({
      teamTags: Object.fromEntries(k.map((x) => [x.id, x.tag === "misleading" ? "relevant" : x.tag])),
      teamTimeline: order.slice(1),
      initialCategory: trap,
      finalCategory: trap,
      citedEvidence: clues.slice(0, 5),
    }),
    partialTimeline: run({ teamTimeline: order.slice(0, Math.ceil(order.length / 2)) }),
    twoEvents: run({ teamTimeline: order.slice(0, 2) }),
    dumpTimed: run({ teamTimeline: [...order, ...timedWrong] }),
    citeAll: run({ finalCategory: answer, citedEvidence: k.map((x) => x.id) }),
    empty: run({}),
    duplicate: run({ ...good, teamTimeline: [...order, ...order, null, order[0]], citedEvidence: [...clues.slice(0, 5), ...clues.slice(0, 5)], initialCategory: answer, finalCategory: answer }),
    malformed: run({
      teamTags: { ...right, ZZ99: "relevant", "": "misleading" },
      teamTimeline: ["ZZ99", ...order, "not-a-code"],
      initialCategory: "nonsense",
      finalCategory: answer,
      citedEvidence: ["ZZ99", "", ...clues.slice(0, 4)],
    }),
  };

  test(`${c.code}: perfect team = ${MAX_AUTO}`, () =>
    assert.deepEqual(s.perfect, { tagging: 15, timeline: 15, hypothesis: 6, root_cause: 8, evidence_support: 6, total: 50 }));
  test(`${c.code}: correct only after the twist = 44 (no hypothesis points)`, () =>
    assert.deepEqual(s.correctAfterTwistOnly, { tagging: 15, timeline: 15, hypothesis: 0, root_cause: 8, evidence_support: 6, total: 44 }));
  test(`${c.code}: completely wrong team = 0`, () =>
    assert.deepEqual(s.wrong, { tagging: 0, timeline: 0, hypothesis: 0, root_cause: 0, evidence_support: 0, total: 0 }));
  test(`${c.code}: random tagging averages ≤ 2/15; 95% of random teams score ≤ 6/15`, () => {
    assert.ok(randomAvg <= 2, `random average ${randomAvg}`);
    assert.ok(randomP95 <= 6, `random 95th percentile ${randomP95}`);
  });
  test(`${c.code}: everything marked relevant = 0 tagging points`, () => assert.equal(s.allRelevant.total, 0));
  test(`${c.code}: copying the twist without evidence reasoning ≤ 15/50`, () => {
    assert.equal(s.twistCopy.tagging, 0);
    assert.equal(s.twistCopy.hypothesis, 0);
    assert.equal(s.twistCopy.evidence_support, 0);
    assert.ok(s.twistCopy.total <= 15, `twist copy ${s.twistCopy.total}`);
  });
  test(`${c.code}: trap hypothesis kept = no root-cause, hypothesis or support points`, () => {
    assert.equal(s.trap.hypothesis + s.trap.root_cause + s.trap.evidence_support, 0);
    assert.ok(s.trap.total < 25, `trap total ${s.trap.total}`);
  });
  test(`${c.code}: partial timeline follows the formula; two lucky events stay small`, () => {
    const half = Math.ceil(order.length / 2) / order.length;
    assert.equal(s.partialTimeline.timeline, Math.round(15 * half * 10) / 10);
    assert.ok(s.twoEvents.timeline <= 5, `two events ${s.twoEvents.timeline}`);
    assert.ok(s.dumpTimed.timeline <= 7, `dump every timestamped item ${s.dumpTimed.timeline}`);
  });
  test(`${c.code}: citing every item earns no evidence support`, () => assert.equal(s.citeAll.evidence_support, 0));
  test(`${c.code}: empty submission = 0`, () => assert.equal(s.empty.total, 0));
  test(`${c.code}: duplicates don't add points`, () => assert.deepEqual(s.duplicate, s.perfect));
  test(`${c.code}: malformed input is ignored, never crashes, never exceeds the maximum`, () => {
    assert.ok(s.malformed.total <= MAX_AUTO && s.malformed.total >= 0);
    assert.equal(s.malformed.tagging, 15);
    assert.equal(s.malformed.timeline, 15);
    assert.equal(s.malformed.evidence_support, 6);
  });
  report.push(
    `${c.code.padEnd(7)} perfect ${s.perfect.total} · after-twist-only ${s.correctAfterTwistOnly.total} · wrong ${s.wrong.total} · random-tags avg ${randomAvg}/15 (p95 ${randomP95}) · all-relevant ${s.allRelevant.total} · twist-copy ${s.twistCopy.total} · trap ${s.trap.total} · half-timeline ${s.partialTimeline.timeline}/15 · two-events ${s.twoEvents.timeline}/15 · dump-timed ${s.dumpTimed.timeline}/15 · empty ${s.empty.total} · duplicate ${s.duplicate.total} · malformed ${s.malformed.total}`,
  );
}

// -------------------------------------------------------------- 3. bounds
test("fuzz: 5,000 random submissions stay within 0..max for every component", () => {
  const tags: (Tag | null)[] = ["relevant", "irrelevant", "misleading", null];
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const ids = [...key.map((k) => k.id), "x", "y"];
  for (let i = 0; i < 5000; i++) {
    const s = scoreAuto({
      key,
      postTwistCategory: "Y",
      teamTags: Object.fromEntries(ids.map((id) => [id, tags[Math.floor(rnd() * 4)]])),
      teamTimeline: Array.from({ length: Math.floor(rnd() * 12) }, () => (rnd() < 0.1 ? null : ids[Math.floor(rnd() * ids.length)])),
      initialCategory: ["X", "Y", null][Math.floor(rnd() * 3)],
      finalCategory: ["X", "Y", "Z", null][Math.floor(rnd() * 4)],
      citedEvidence: Array.from({ length: Math.floor(rnd() * 8) }, () => ids[Math.floor(rnd() * ids.length)]),
    });
    assert.ok(s.tagging >= 0 && s.tagging <= POINTS.tagging && s.timeline >= 0 && s.timeline <= POINTS.timeline);
    assert.ok([0, POINTS.hypothesis].includes(s.hypothesis) && [0, POINTS.root_cause].includes(s.root_cause));
    assert.ok(s.evidence_support >= 0 && s.evidence_support <= POINTS.evidence_support);
    assert.ok(s.total >= 0 && s.total <= MAX_AUTO);
  }
});

console.log(report.join("\n"));
console.log(`\nscoring tests passed (${passed} tests)`);
