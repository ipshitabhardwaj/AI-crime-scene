/**
 * Fairness audit of the event cases (organisers only).
 *   npm run audit:cases
 *
 * Prints, per case: how the correct answers are spread over A–D, how often the
 * correct option is also the longest one (a give-away if it happens too
 * often), reading load, and whether the culprit's name is spelled out in a
 * round-1 clue as the answer. FAIL = must fix; WARN = review by a human.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseFileSchema } from "../lib/cases/schema";

const dir = join(process.cwd(), "cases");
let fails = 0;
let warns = 0;
const LETTER = "ABCD";

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const c = CaseFileSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
  const all = [...c.questions, ...c.twist_questions];
  console.log(`\n${c.code} · ${c.title}`);

  const spread = [1, 2, 3, 4].map((n) => all.filter((q) => q.answer === n).length);
  console.log(`  ·    correct answers: ${spread.map((n, i) => `${LETTER[i]}×${n}`).join("  ")}`);
  if (Math.max(...spread) > Math.ceil(all.length / 2)) {
    fails++;
    console.log("  FAIL one option letter is correct for more than half of the questions");
  }
  const runs = all.some((q, i) => i >= 2 && q.answer === all[i - 1].answer && q.answer === all[i - 2].answer);
  if (runs) {
    warns++;
    console.log("  WARN the same letter is correct three times in a row");
  }

  const longest = all.filter((q) => q.options[q.answer - 1].length === Math.max(...q.options.map((o) => o.length)));
  console.log(`  ·    correct option is the longest in ${longest.length}/${all.length} questions (${longest.map((q) => q.code).join(", ") || "none"})`);
  if (longest.length > all.length * 0.6) {
    warns++;
    console.log("  WARN teams could guess by picking the longest option");
  }

  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const reading = words(c.briefing_md) + all.reduce((n, q) => n + words(q.clue.text) + words(q.question) + q.options.reduce((m, o) => m + words(o), 0), 0);
  console.log(`  ·    reading load: about ${reading} words (${Math.round(reading / 150)} minutes at an easy pace)`);

  const culpritName = c.answer.culprit.split(/[ (]/)[0];
  const direct = c.questions.filter((q) => new RegExp(`${culpritName} (did it|is the culprit|is guilty|confess)`, "i").test(q.clue.text));
  if (direct.length) {
    fails++;
    console.log(`  FAIL a round-1 clue names the culprit outright (${direct.map((q) => q.code).join(", ")})`);
  }
  console.log(`  ·    first suspect: ${c.answer.first_suspect}  →  culprit: ${c.answer.culprit}`);
}

console.log(fails ? `\n${fails} failure(s), ${warns} warning(s).` : `\nNo failures (${warns} warnings to review).`);
if (fails) process.exit(1);
