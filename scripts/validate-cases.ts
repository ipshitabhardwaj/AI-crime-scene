/**
 * Validates every event case in /cases (not /cases/examples).
 *   npm run validate:cases
 *
 * Per case: the file format (same check as the upload), 6–12 round-1
 * questions coded Q1…, 2–4 twist questions coded T1…, four different options
 * per question, 3–5 suspects, a short story, and that a perfect team scores
 * exactly the maximum. Across cases: unique codes and the same number of
 * questions, so every team has the same amount of work.
 * Exits with code 1 on any failure.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseFileSchema, type CaseFile } from "../lib/cases/schema";
import { MAX_AUTO, scoreAuto } from "../lib/scoring";

const dir = join(process.cwd(), "cases");
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
let failures = 0;
const fail = (file: string, msg: string) => {
  failures++;
  console.error(`✗ ${file}: ${msg}`);
};

const loaded: { file: string; c: CaseFile }[] = [];

for (const file of files) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch (e) {
    fail(file, `not valid JSON (${e instanceof Error ? e.message : e})`);
    continue;
  }
  const parsed = CaseFileSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) fail(file, `${i.path.join(".") || "(root)"}: ${i.message}`);
    continue;
  }
  const c = parsed.data;
  loaded.push({ file, c });

  if (c.questions.length < 6 || c.questions.length > 12) fail(file, `${c.questions.length} round-1 questions (expected 6–12)`);
  if (c.twist_questions.length < 2 || c.twist_questions.length > 4) fail(file, `${c.twist_questions.length} twist questions (expected 2–4)`);
  c.questions.forEach((q, i) => q.code !== `Q${i + 1}` && fail(file, `round-1 question ${i + 1} should be coded Q${i + 1} (got ${q.code})`));
  c.twist_questions.forEach((q, i) => q.code !== `T${i + 1}` && fail(file, `twist question ${i + 1} should be coded T${i + 1} (got ${q.code})`));
  for (const q of [...c.questions, ...c.twist_questions]) {
    if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) fail(file, `${q.code}: the four options must be different`);
    if (q.question.length > 160) fail(file, `${q.code}: question is long (${q.question.length} characters, keep under 160)`);
    if (q.clue.text.length > 600) fail(file, `${q.code}: clue is long (${q.clue.text.length} characters, keep under 600)`);
  }
  if (c.suspects.length < 3 || c.suspects.length > 5) fail(file, `${c.suspects.length} suspects (expected 3–5)`);
  if (new Set(c.suspects).size !== c.suspects.length) fail(file, "duplicate suspects");
  const words = c.briefing_md.split(/\s+/).length;
  if (words > 220) fail(file, `story is ${words} words (keep under 220)`);

  const key = [...c.questions.map((q) => ({ code: q.code, answer: q.answer, twist: false })), ...c.twist_questions.map((q) => ({ code: q.code, answer: q.answer, twist: true }))];
  const perfect = scoreAuto({
    key,
    culprit: c.answer.culprit,
    answers: Object.fromEntries(key.map((q) => [q.code, { choice: q.answer }])),
    initialCulprit: c.answer.culprit,
    finalCulprit: c.answer.culprit,
  });
  if (perfect.total !== MAX_AUTO) fail(file, `a perfect team scores ${perfect.total}, expected ${MAX_AUTO}`);

  console.log(`✓ ${file}: ${c.code} “${c.title}” · ${c.questions.length} questions + ${c.twist_questions.length} twist · ${c.suspects.length} suspects · story ${words} words`);
}

const codes = loaded.map((l) => l.c.code);
const dupCode = codes.find((x, i) => codes.indexOf(x) !== i);
if (dupCode) fail("(all)", `case code ${dupCode} is used twice`);
if (loaded.length) {
  const [a, b] = [loaded[0].c.questions.length, loaded[0].c.twist_questions.length];
  for (const { file, c } of loaded) {
    if (c.questions.length !== a || c.twist_questions.length !== b) fail(file, `has ${c.questions.length}+${c.twist_questions.length} questions; ${loaded[0].file} has ${a}+${b}. All cases must match.`);
  }
}
if (!loaded.length) fail("(all)", "no case files found in /cases");

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log(`\nAll ${loaded.length} cases are valid.`);
