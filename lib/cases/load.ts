import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseFileSchema, type CaseFile } from "./schema";

/**
 * Validate a case JSON and write it into cases / case_twists / evidence /
 * answer_key / answer_evidence. Re-loading the same case code updates it in place.
 * Needs a service-role client (or an admin session).
 * Used by `npm run seed` now and by the admin "Upload case" page later.
 */
export async function loadCase(supabase: SupabaseClient, raw: unknown): Promise<{ caseId: string; evidence: number }> {
  const parsed = CaseFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid case file:\n" + parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n"));
  }
  const c: CaseFile = parsed.data;

  const { data: caseRow, error: caseErr } = await supabase
    .from("cases")
    .upsert(
      { code: c.code, title: c.title, briefing_md: c.briefing_md, root_cause_options: c.root_cause_options },
      { onConflict: "code" },
    )
    .select("id")
    .single();
  if (caseErr) throw caseErr;
  const caseId = caseRow.id as string;

  // Upsert evidence by (case, code) so re-uploading a corrected case keeps
  // teams' tags and timelines. Items removed from the file are deleted.
  const { data: inserted, error: evErr } = await supabase
    .from("evidence")
    .upsert(
      c.evidence.map((e, i) => ({
        case_id: caseId,
        code: e.code,
        type: e.type,
        title: e.title,
        time_label: e.time_label ?? null,
        content: e.content,
        is_twist: e.is_twist,
        sort_order: i,
      })),
      { onConflict: "case_id,code" },
    )
    .select("id, code");
  if (evErr) throw evErr;

  const keep = c.evidence.map((e) => e.code);
  const { data: stale } = await supabase.from("evidence").select("id, code").eq("case_id", caseId);
  const staleIds = (stale ?? []).filter((r) => !keep.includes(r.code as string)).map((r) => r.id as string);
  if (staleIds.length) {
    const del = await supabase.from("evidence").delete().in("id", staleIds);
    if (del.error) throw del.error;
  }

  const idByCode = new Map(inserted.map((r) => [r.code as string, r.id as string]));
  const { error: aeErr } = await supabase.from("answer_evidence").upsert(
    c.evidence.map((e) => ({ evidence_id: idByCode.get(e.code)!, tag: e.key.tag, timeline_pos: e.key.timeline_pos })),
  );
  if (aeErr) throw aeErr;

  const { error: akErr } = await supabase.from("answer_key").upsert({ case_id: caseId, ...c.answer });
  if (akErr) throw akErr;

  const { error: twErr } = await supabase.from("case_twists").upsert({ case_id: caseId, twist_md: c.twist_md });
  if (twErr) throw twErr;

  return { caseId, evidence: inserted.length };
}
