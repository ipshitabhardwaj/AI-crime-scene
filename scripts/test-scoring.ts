/**
 * Scoring tests.  npm run test:scoring
 *
 * 1. Unit tests of each rule with hand-computed expected values.
 * 2. For EVERY case file in /cases: perfect, completely wrong, partial,
 *    fell-for-the-trap, corrected-after-twist, empty, duplicate and malformed
 *    submissions, checked against the documented rules.
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
  judgePoints,
  scoreAdaptability,
  scoreAuto,
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
const key: KeyEvidence[] = [
  { id: "a", tag: "relevant", timeline_pos: 1 },
  { id: "b", tag: "relevant", timeline_pos: 2 },
  { id: "c", tag: "relevant", timeline_pos: 3 },
  { id: "d", tag: "misleading", timeline_pos: null },
  { id: "e", tag: "irrelevant", timeline_pos: null },
];

test("tagging: all right = 15, none = 0, 1 of 5 = 3", () => {
  assert.equal(scoreTagging(key, { a: "relevant", b: "relevant", c: "relevant", d: "misleading", e: "irrelevant" }), 15);
  assert.equal(scoreTagging(key, {}), 0);
  assert.equal(scoreTagging(key, { a: "relevant", d: "relevant" }), 3);
  assert.equal(scoreTagging([], {}), 0);
});
test("timeline: perfect 15, reversed 7.5, one extra 13.9, dup/null ignored, wrong-only 0, empty 0", () => {
  assert.equal(scoreTimeline(key, ["a", "b", "c"]), 15);
  assert.equal(scoreTimeline(key, ["c", "b", "a"]), 7.5); // F1 = 1, 0 of 3 pairs ordered
  assert.equal(scoreTimeline(key, ["a", "b", "c", "d"]), 13.9); // P 3/4, R 1 → F1 6/7
  assert.equal(scoreTimeline(key, ["a", null, "a", "b", "c"]), 15);
  assert.equal(scoreTimeline(key, ["d", "e"]), 0);
  assert.equal(scoreTimeline(key, []), 0);
  assert.equal(scoreTimeline(key, ["a"]), 3.8); // F1 = 0.5, one event has no order to judge → 15 × 0.25 = 3.75
});
test("root cause: exact category match only", () => {
  assert.equal(scoreRootCause("Y", "Y"), 10);
  assert.equal(scoreRootCause("y", "Y"), 0);
  assert.equal(scoreRootCause(null, "Y"), 0);
});
test("adaptability: right → 10, changed but wrong → 3, unchanged wrong → 0", () => {
  assert.equal(scoreAdaptability("X", "Y", "Y"), 10);
  assert.equal(scoreAdaptability("Y", "Y", "Y"), 10);
  assert.equal(scoreAdaptability("X", "Z", "Y"), 3);
  assert.equal(scoreAdaptability("X", "X", "Y"), 0);
  assert.equal(scoreAdaptability(null, null, "Y"), 0);
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
test("selectScoredAnswers: snapshot beats live tags; final timeline/category fall back to initial", () => {
  const r = selectScoredAnswers({
    initialCategory: "X",
    finalCategory: null,
    finalTagsSnapshot: { a: "relevant" },
    liveTags: { a: "misleading" },
    finalTimeline: [],
    initialTimeline: ["a"],
  });
  assert.deepEqual(r, { teamTags: { a: "relevant" }, teamTimeline: ["a"], initialCategory: "X", finalCategory: "X" });
  const r2 = selectScoredAnswers({ finalCategory: "Y", liveTags: { a: "irrelevant" }, finalTimeline: ["b"], initialTimeline: ["a"] });
  assert.deepEqual(r2, { teamTags: { a: "irrelevant" }, teamTimeline: ["b"], initialCategory: null, finalCategory: "Y" });
});

// ---------------------------------------------------------- 2. every case
const dir = join(process.cwd(), "cases");
const report: string[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const c = CaseFileSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
  const k: KeyEvidence[] = c.evidence.map((e) => ({ id: e.code, tag: e.key.tag, timeline_pos: e.key.timeline_pos }));
  const right = Object.fromEntries(k.map((x) => [x.id, x.tag])) as Record<string, Tag>;
  const order = k.filter((x) => x.timeline_pos).sort((a, b) => a.timeline_pos! - b.timeline_pos!).map((x) => x.id);
  const trap = c.answer.root_cause_category;
  const answer = c.answer.post_twist_category;
  const other = c.root_cause_options.find((o) => o !== trap && o !== answer)!;
  const wrongTag = (t: Tag): Tag => (t === "relevant" ? "misleading" : t === "misleading" ? "irrelevant" : "relevant");
  const run = (o: Partial<Parameters<typeof scoreAuto>[0]>) =>
    scoreAuto({ key: k, postTwistCategory: answer, teamTags: {}, teamTimeline: [], initialCategory: null, finalCategory: null, ...o });

  const s = {
    perfect: run({ teamTags: right, teamTimeline: order, initialCategory: trap, finalCategory: answer }),
    wrong: run({
      teamTags: Object.fromEntries(k.map((x) => [x.id, wrongTag(x.tag)])),
      teamTimeline: k.filter((x) => !x.timeline_pos).map((x) => x.id),
      initialCategory: other,
      finalCategory: other,
    }),
    // half the tags right, correct events with the first two swapped, right answer found before the twist
    partial: run({
      teamTags: Object.fromEntries(k.map((x, i) => [x.id, i % 2 ? wrongTag(x.tag) : x.tag])),
      teamTimeline: [order[1], order[0], ...order.slice(2)],
      initialCategory: answer,
      finalCategory: answer,
    }),
    trap: run({
      teamTags: Object.fromEntries(k.map((x) => [x.id, x.tag === "misleading" ? "relevant" : x.tag])),
      teamTimeline: order.slice(1),
      initialCategory: trap,
      finalCategory: trap,
    }),
    corrected: run({ teamTags: right, teamTimeline: order, initialCategory: trap, finalCategory: answer }),
    changedButWrong: run({ teamTags: right, teamTimeline: order, initialCategory: trap, finalCategory: other }),
    empty: run({}),
    duplicate: run({ teamTags: right, teamTimeline: [...order, ...order, null, order[0]], initialCategory: trap, finalCategory: answer }),
    malformed: run({ teamTags: { ...right, ZZ99: "relevant", "": "misleading" }, teamTimeline: ["ZZ99", ...order, "not-a-code"], initialCategory: "nonsense", finalCategory: answer }),
  };

  test(`${c.code}: perfect = ${MAX_AUTO}`, () => assert.deepEqual(s.perfect, { tagging: 15, timeline: 15, root_cause: 10, adaptability: 10, total: 50 }));
  test(`${c.code}: completely wrong = 0`, () => assert.deepEqual(s.wrong, { tagging: 0, timeline: 0, root_cause: 0, adaptability: 0, total: 0 }));
  test(`${c.code}: partial matches the formula`, () => {
    const half = Math.round((15 * k.filter((_, i) => i % 2 === 0).length) / k.length * 10) / 10;
    const pairs = (order.length * (order.length - 1)) / 2;
    const tl = Math.round(15 * (0.5 + 0.5 * ((pairs - 1) / pairs)) * 10) / 10;
    assert.deepEqual(s.partial, { tagging: half, timeline: tl, root_cause: 10, adaptability: 10, total: Math.round((half + tl + 20) * 10) / 10 });
  });
  test(`${c.code}: trapped team gets no root-cause or adaptability points`, () => {
    assert.equal(s.trap.root_cause, 0);
    assert.equal(s.trap.adaptability, 0);
    assert.ok(s.trap.total < 30, `trap total ${s.trap.total}`);
  });
  test(`${c.code}: correcting after the twist earns full root-cause + adaptability`, () => {
    assert.equal(s.corrected.root_cause, 10);
    assert.equal(s.corrected.adaptability, 10);
    assert.equal(s.changedButWrong.adaptability, 3);
    assert.equal(s.changedButWrong.root_cause, 0);
  });
  test(`${c.code}: empty submission = 0`, () => assert.equal(s.empty.total, 0));
  test(`${c.code}: duplicates don't add points`, () => assert.deepEqual(s.duplicate, s.perfect));
  test(`${c.code}: malformed input is ignored, never crashes, never exceeds the maximum`, () => {
    assert.ok(s.malformed.total <= MAX_AUTO && s.malformed.total >= 0);
    assert.equal(s.malformed.tagging, 15);
  });
  report.push(
    `${c.code.padEnd(7)} perfect ${s.perfect.total} · wrong ${s.wrong.total} · partial ${s.partial.total} · trap ${s.trap.total} · corrected ${s.corrected.total} · changed-but-wrong ${s.changedButWrong.total} · empty ${s.empty.total} · duplicate ${s.duplicate.total} · malformed ${s.malformed.total}`,
  );
}

// -------------------------------------------------------------- 3. bounds
test("fuzz: 5,000 random submissions stay within 0..max for every component", () => {
  const tags: (Tag | null)[] = ["relevant", "irrelevant", "misleading", null];
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const ids = ["a", "b", "c", "d", "e", "x", "y"];
  for (let i = 0; i < 5000; i++) {
    const s = scoreAuto({
      key,
      postTwistCategory: "Y",
      teamTags: Object.fromEntries(ids.map((id) => [id, tags[Math.floor(rnd() * 4)]])),
      teamTimeline: Array.from({ length: Math.floor(rnd() * 12) }, () => (rnd() < 0.1 ? null : ids[Math.floor(rnd() * ids.length)])),
      initialCategory: ["X", "Y", null][Math.floor(rnd() * 3)],
      finalCategory: ["X", "Y", "Z", null][Math.floor(rnd() * 4)],
    });
    assert.ok(s.tagging >= 0 && s.tagging <= 15 && s.timeline >= 0 && s.timeline <= 15);
    assert.ok([0, 10].includes(s.root_cause) && [0, 3, 10].includes(s.adaptability));
    assert.ok(s.total >= 0 && s.total <= MAX_AUTO);
  }
});

console.log(report.join("\n"));
console.log(`\nscoring tests passed (${passed} tests)`);
