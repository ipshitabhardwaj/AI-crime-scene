"use server";

import { revalidatePath } from "next/cache";
import { UserError, runAction } from "@/lib/admin-action";
import { requireRole } from "@/lib/auth";
import { loadCase } from "@/lib/cases/load";
import { createAdminClient } from "@/lib/supabase/admin";

export type UploadResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Upload / update a case. During the event (any phase except Waiting) the
 * organiser must tick a confirmation, because changing evidence or the
 * answer key mid-game changes what teams see and how they are scored.
 */
export async function uploadCase(jsonText: string, allowDuringEvent: boolean): Promise<UploadResult> {
  await requireRole("admin");
  if (typeof jsonText !== "string" || jsonText.length > 1_000_000) return { ok: false, error: "File too large (max 1 MB)." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : e}` };
  }
  const db = createAdminClient();
  const { data: ev } = await db.from("event").select("phase").eq("id", 1).single();
  if (ev && ev.phase !== "waiting" && !allowDuringEvent) {
    return { ok: false, error: "The event is in progress. Tick the confirmation to update a case now (then re-run auto-scoring)." };
  }
  try {
    const { evidence } = await loadCase(db, parsed);
    revalidatePath("/admin", "layout");
    const code = (parsed as { code?: string }).code;
    const note = ev && ev.phase !== "waiting" ? " Re-run auto-scoring before judging." : "";
    return { ok: true, message: `Loaded ${code} with ${evidence} questions.${note}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteCase(formData: FormData) {
  await requireRole("admin");
  await runAction("/admin/cases", async () => {
    if (String(formData.get("confirm")).trim() !== "DELETE") throw new UserError("Type DELETE to confirm.");
    const db = createAdminClient();
    const { data: ev } = await db.from("event").select("phase").eq("id", 1).single();
    if (ev?.phase !== "waiting") throw new UserError("Cases can only be deleted before the investigation starts (phase Waiting).");
    const caseId = String(formData.get("caseId"));
    const { count } = await db.from("teams").select("id", { count: "exact", head: true }).eq("case_id", caseId);
    const { data } = await db.from("cases").delete().eq("id", caseId).select("code").single();
    revalidatePath("/admin", "layout");
    return `Deleted ${data?.code ?? "case"}.${count ? ` ${count} team(s) now have no case: go to Teams → Rebalance cases.` : ""}`;
  });
}
