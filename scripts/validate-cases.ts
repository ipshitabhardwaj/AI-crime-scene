/**
 * Validates every event case in /cases (not /cases/examples).
 *   npm run validate:cases
 *
 * Checks, per case: schema (same as the upload), evidence count, unique codes,
 * twist items (T.. codes, is_twist), share of misleading/irrelevant items,
 * a gap-free timeline of relevant, time-stamped items, answer categories in
 * the option list, pre- vs post-twist answers differ, no evidence text that
 * spells out the answer category, safe screenshot URLs, a definition for every
 * root-cause option, and that a perfect team scores exactly the maximum. Across cases: identical option lists and
 * unique case codes. Exits with code 1 on any failure.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseFileSchema, type CaseFile } from "../lib/cases/schema";
import { ROOT_CAUSE_HELP } from "../lib/root-causes";
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
  const ev = c.evidence;

  if (ev.length < 14 || ev.length > 22) fail(file, `${ev.length} evidence items (expected 14–22)`);
  for (const e of ev) {
    if (e.is_twist && !/^T\d{2}$/.test(e.code)) fail(file, `twist item ${e.code} should be coded T01, T02…`);
    if (!e.is_twist && !/^E\d{2}$/.test(e.code)) fail(file, `item ${e.code} should be coded E01, E02…`);
    if (!e.title.trim()) fail(file, `${e.code} has no title`);
    if (e.type === "screenshot") {
      const url = String((e.content as { image_url?: string }).image_url ?? "");
      if (!/^(https:\/\/|\/)/.test(url)) fail(file, `${e.code} screenshot URL must start with https:// or /`);
    }
  }
  const twists = ev.filter((e) => e.is_twist);
  if (twists.length < 1 || twists.length > 3) fail(file, `${twists.length} twist items (expected 1–3)`);
  if (!c.twist_md.trim()) fail(file, "twist_md is empty");

  const noise = ev.filter((e) => e.key.tag !== "relevant").length;
  const share = noise / ev.length;
  if (share < 0.25 || share > 0.5) fail(file, `${Math.round(share * 100)}% misleading/irrelevant (expected 25–50%)`);
  if (!ev.some((e) => e.key.tag === "misleading")) fail(file, "no misleading item");
  if (!ev.some((e) => e.key.tag === "irrelevant")) fail(file, "no irrelevant item");

  const timeline = ev.filter((e) => e.key.timeline_pos !== null).sort((a, b) => a.key.timeline_pos! - b.key.timeline_pos!);
  if (timeline.length < 4) fail(file, `timeline has ${timeline.length} steps (expected ≥ 4)`);
  for (const e of timeline) {
    if (e.key.tag !== "relevant") fail(file, `timeline item ${e.code} is tagged ${e.key.tag}; timeline items must be relevant`);
    if (!e.time_label) fail(file, `timeline item ${e.code} has no time_label, so teams cannot order it`);
  }

  if (c.answer.root_cause_category === c.answer.post_twist_category) fail(file, "pre-twist and post-twist categories are the same (no trap)");
  const text = JSON.stringify(ev.map((e) => [e.title, e.content])).toLowerCase();
  if (text.includes(c.answer.post_twist_category.toLowerCase())) fail(file, `evidence spells out the answer category “${c.answer.post_twist_category}”`);

  for (const o of c.root_cause_options) if (!ROOT_CAUSE_HELP[o]) fail(file, `root cause option “${o}” has no definition in lib/root-causes.ts`);

  const key = ev.map((e) => ({ id: e.code, tag: e.key.tag, timeline_pos: e.key.timeline_pos, twist: e.is_twist }));
  const perfect = scoreAuto({
    key,
    postTwistCategory: c.answer.post_twist_category,
    teamTags: Object.fromEntries(key.map((k) => [k.id, k.tag])),
    teamTimeline: timeline.map((e) => e.code),
    initialCategory: c.answer.post_twist_category,
    finalCategory: c.answer.post_twist_category,
    citedEvidence: key.filter((k) => k.tag === "relevant" && !k.twist).map((k) => k.id),
  });
  if (perfect.total !== MAX_AUTO) fail(file, `a perfect team scores ${perfect.total}, expected ${MAX_AUTO}`);

  console.log(
    `✓ ${c.code} (${file}): ${ev.length} items, ${twists.length} twist, ${Math.round(share * 100)}% noise, ` +
      `timeline ${timeline.map((e) => e.code).join(" > ")}, answer “${c.answer.post_twist_category}”`,
  );
}

if (loaded.length) {
  const opts = JSON.stringify(loaded[0].c.root_cause_options);
  for (const { file, c } of loaded) {
    if (JSON.stringify(c.root_cause_options) !== opts) fail(file, "root_cause_options differ from the other cases (the dropdown would hint the answer)");
  }
  const codes = loaded.map((l) => l.c.code);
  if (new Set(codes).size !== codes.length) fail("(all)", `duplicate case codes: ${codes.join(", ")}`);
}

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log(`\nAll ${loaded.length} cases valid.`);
