import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseFileSchema, type CaseFile } from "./schema";

/**
 * Validate a case JSON and write it into the database. Re-loading the same
 * case code updates it in place.
 *
 * The quiz reuses the tables of the original evidence game, so no new
 * migration is needed:
 *   cases.root_cause_options   = the suspects
 *   evidence (one row/question) = title: the question, content: clue + options,
 *                                 is_twist: twist question (hidden until the twist)
 *   answer_evidence.timeline_pos = the correct option (1–4)
 *   answer_key.root_cause_category = first suspect, post_twist_category = culprit
 * A team's answer is stored in evidence_tags (see app/actions/team.ts).
 * Needs a service-role client (or an admin session).
 */
export async function loadCase(supabase: SupabaseClient, raw: unknown): Promise<{ caseId: string; evidence: number }> {
  const parsed = CaseFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid case file:\n" + parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n"));
  }
  const c: CaseFile = parsed.data;
  const all = [...c.questions.map((q) => ({ ...q, twist: false })), ...c.twist_questions.map((q) => ({ ...q, twist: true }))];

  const { data: caseRow, error: caseErr } = await supabase
    .from("cases")
    .upsert({ code: c.code, title: c.title, briefing_md: c.briefing_md, root_cause_options: c.suspects }, { onConflict: "code" })
    .select("id")
    .single();
  if (caseErr) throw caseErr;
  const caseId = caseRow.id as string;

  // Upsert by (case, code) so re-uploading a corrected case keeps teams'
  // answers. Questions removed from the file are deleted.
  const { data: inserted, error: evErr } = await supabase
    .from("evidence")
    .upsert(
      all.map((q, i) => ({
        case_id: caseId,
        code: q.code,
        type: "note",
        title: q.question,
        time_label: null,
        content: { clue_label: q.clue.label, clue_title: q.clue.title, clue_text: q.clue.text, options: q.options },
        is_twist: q.twist,
        sort_order: i,
      })),
      { onConflict: "case_id,code" },
    )
    .select("id, code");
  if (evErr) throw evErr;

  const keep = all.map((q) => q.code);
  const { data: stale } = await supabase.from("evidence").select("id, code").eq("case_id", caseId);
  const staleIds = (stale ?? []).filter((r) => !keep.includes(r.code as string)).map((r) => r.id as string);
  if (staleIds.length) {
    const del = await supabase.from("evidence").delete().in("id", staleIds);
    if (del.error) throw del.error;
  }

  const idByCode = new Map(inserted.map((r) => [r.code as string, r.id as string]));
  const { error: aeErr } = await supabase
    .from("answer_evidence")
    .upsert(all.map((q) => ({ evidence_id: idByCode.get(q.code)!, tag: "relevant", timeline_pos: q.answer })));
  if (aeErr) throw aeErr;

  const { error: akErr } = await supabase.from("answer_key").upsert({
    case_id: caseId,
    root_cause_category: c.answer.first_suspect,
    root_cause_md: c.answer.explanation,
    responsible: "",
    post_twist_category: c.answer.culprit,
    post_twist_responsible: "",
  });
  if (akErr) throw akErr;

  const { error: twErr } = await supabase.from("case_twists").upsert({ case_id: caseId, twist_md: c.twist_md });
  if (twErr) throw twErr;

  return { caseId, evidence: inserted.length };
}
