/**
 * Structured fairness audit of the event cases (organisers only).
 *   npm run audit:cases
 *
 * Prints, per case: evidence counts, noise ratio, time labels, key-timeline
 * time order, how many pre-twist clues exist (for the evidence-support score),
 * answer-leakage keyword hits in pre-twist evidence, and whether the twist
 * items name the answer. FAIL = must fix; WARN = review by a human.
 * The human judgement for each case is recorded in docs/CASE_AUDIT.md.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseFileSchema } from "../lib/cases/schema";
import { POINTS } from "../lib/scoring";

/** Words that would give a category away if they appeared before the twist. */
const LEAK_WORDS: Record<string, string[]> = {
  "Compromised credentials / external attacker": ["attacker", "stolen password", "credential stuffing"],
  "Deliberate insider action": ["sabotage", "on purpose", "deliberately"],
  "Human error during an approved change": ["human error", "my mistake", "forgot to"],
  "Buggy code release": ["bug", "buggy", "defect", "regression"],
  "Bad or wrongly formatted input data": ["wrong format", "malformed", "bad data", "decimal separator"],
  "AI model or prompt error": ["hallucinat"],
  "Prompt injection": ["prompt injection", "ignore previous instructions"],
  "Hardware failure": ["hardware fault", "faulty sensor"],
  "Test or staging activity hitting production": ["staging", "load test", "test traffic"],
  "Third-party service outage": ["outage", "service unavailable"],
};

const toSec = (label: string | null | undefined): number | null => {
  const m = label?.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : null;
};

const dir = join(process.cwd(), "cases");
let fails = 0;
let warns = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const c = CaseFileSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
  const ev = c.evidence;
  const lines: string[] = [];
  const fail = (m: string) => (fails++, lines.push(`  FAIL ${m}`));
  const warn = (m: string) => (warns++, lines.push(`  WARN ${m}`));
  const info = (m: string) => lines.push(`  ·    ${m}`);

  const rel = ev.filter((e) => e.key.tag === "relevant");
  const mis = ev.filter((e) => e.key.tag === "misleading");
  const irr = ev.filter((e) => e.key.tag === "irrelevant");
  const twist = ev.filter((e) => e.is_twist);
  const timed = ev.filter((e) => e.time_label);
  const keyTl = ev.filter((e) => e.key.timeline_pos !== null).sort((a, b) => a.key.timeline_pos! - b.key.timeline_pos!);
  const preClues = rel.filter((e) => !e.is_twist);

  info(`${ev.length} items (${twist.length} twist) · relevant ${rel.length} · misleading ${mis.length} · irrelevant ${irr.length} · noise ${Math.round(((mis.length + irr.length) / ev.length) * 100)}%`);
  info(`${timed.length}/${ev.length} items have a time label; key timeline ${keyTl.map((e) => `${e.code}(${e.time_label})`).join(" > ")}`);
  info(`misleading (trap support): ${mis.map((e) => `${e.code} ${e.title}`).join(" | ")}`);

  // key timeline in time order (pure HH:MM[:SS] labels only; one midnight wrap allowed)
  let prev: number | null = null;
  let wrapped = 0;
  for (const e of keyTl) {
    let s = toSec(e.time_label);
    if (s === null) continue;
    s += wrapped;
    if (prev !== null && s < prev) {
      if (prev - s > 12 * 3600 && wrapped === 0) {
        wrapped = 24 * 3600;
        s += wrapped;
      } else fail(`key timeline ${e.code} (${e.time_label}) is earlier than the step before it`);
    }
    prev = s;
  }

  if (mis.length < 3) warn(`only ${mis.length} misleading items: the trap may be too weak`);
  if (preClues.length < POINTS.citationsRequired) fail(`only ${preClues.length} relevant pre-twist items; full evidence support needs ${POINTS.citationsRequired}`);
  else info(`${preClues.length} relevant pre-twist items available to cite (full support needs ${POINTS.citationsRequired})`);
  if (keyTl.filter((e) => !e.is_twist).length < 4) warn("fewer than 4 key timeline steps exist before the twist");

  const words = LEAK_WORDS[c.answer.post_twist_category] ?? [];
  const preText = (e: (typeof ev)[number]) => JSON.stringify([e.title, e.content]).toLowerCase();
  const leaks = ev.filter((e) => !e.is_twist).flatMap((e) => words.filter((w) => preText(e).includes(w)).map((w) => `${e.code}:“${w}”`));
  if (leaks.length) warn(`pre-twist evidence contains answer words: ${leaks.join(", ")}`);
  else info("no answer keywords in pre-twist evidence");
  const twistLeaks = twist.flatMap((e) => words.filter((w) => preText(e).includes(w)).map((w) => `${e.code}:“${w}”`));
  info(twistLeaks.length ? `twist items name the answer directly (${twistLeaks.join(", ")}): confirms for careful teams; scoring gives no hypothesis or support points for it` : "twist items do not name the answer category");

  console.log(`${c.code} · ${c.title}\n  trap: ${c.answer.root_cause_category}\n  answer: ${c.answer.post_twist_category}\n${lines.join("\n")}\n`);
}
console.log(fails ? `${fails} FAIL, ${warns} WARN` : `No failures (${warns} warnings to review).`);
if (fails) process.exit(1);
