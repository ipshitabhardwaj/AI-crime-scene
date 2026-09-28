"use server";

import { revalidatePath } from "next/cache";
import { UserError, backTo, runAction } from "@/lib/admin-action";
import { requireRole } from "@/lib/auth";
import { JUDGE_CRITERIA } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

/** Save this judge's rubric scores for one team. RLS: only assigned teams; presentation only for the shortlist. */
export async function saveJudgeScores(formData: FormData) {
  const { userId } = await requireRole("judge");
  const teamId = String(formData.get("teamId"));
  const goNext = formData.get("intent") === "next";
  const next = String(formData.get("next") || "");
  const target = goNext && next ? next : backTo(formData, `/judge/${teamId}`);

  await runAction(target, async () => {
    const supabase = await createClient();
    const rows = JUDGE_CRITERIA.flatMap((c) => {
      const raw = formData.get(`score_${c.id}`);
      if (raw === null || String(raw).trim() === "") return [];
      const score = Number(raw);
      if (!Number.isFinite(score) || score < 0 || score > 10) throw new UserError(`${c.label}: enter a number from 0 to 10.`);
      return [{ judge_id: userId, team_id: teamId, criterion: c.id, score, comment: String(formData.get(`comment_${c.id}`) ?? "").slice(0, 1000), updated_at: new Date().toISOString() }];
    });
    if (!rows.length) throw new UserError("Enter at least one score.");
    const { error } = await supabase.from("judge_scores").upsert(rows);
    if (error) {
      throw new UserError(/row-level security/i.test(error.message) ? "Not saved: you are not assigned to this team (or presentation scores are for shortlisted teams only)." : error.message);
    }
    revalidatePath("/judge", "layout");
    return `Saved ${rows.length} score(s).`;
  });
}
