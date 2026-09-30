"use server";

import { revalidatePath } from "next/cache";
import { UserError, confirmed, runAction } from "@/lib/admin-action";
import { requireRole } from "@/lib/auth";
import { computeAutoScores, getLeaderboard } from "@/lib/results";
import { createAdminClient } from "@/lib/supabase/admin";
import { JUDGING_ADMIN_PHASES } from "@/lib/state-machine";
import type { EventPhase } from "@/lib/constants";

const PATH = "/admin/results";
const AFTER_CLOSE = ["closed", "presentations", "results"];

async function phase() {
  const { data } = await createAdminClient().from("event").select("phase").eq("id", 1).single();
  return (data?.phase ?? "waiting") as string;
}

/** Deterministic and idempotent: re-running just recomputes the same numbers. */
export async function runAutoScoring(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    if (!AFTER_CLOSE.includes(await phase()) && !confirmed(formData)) {
      throw new UserError("Submissions are not closed yet, so scores would be provisional. Tick “score anyway” to run it now.");
    }
    const n = await computeAutoScores(createAdminClient());
    revalidatePath("/admin", "layout");
    return `Auto-scored ${n} teams.`;
  });
}

/**
 * Assign the top N teams (by current total) to judges, `perTeam` judges each,
 * round-robin so the load is even. Replaces previous assignments; scores
 * already given are kept.
 */
export async function assignJudges(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const topN = Math.max(1, Math.min(200, Number(formData.get("topN") || 20)));
    const perTeam = Math.max(1, Math.min(10, Number(formData.get("perTeam") || 2)));
    if (!JUDGING_ADMIN_PHASES.includes((await phase()) as EventPhase)) {
      throw new UserError("Judging is set up after submissions are closed (phase Closed or Presentations).");
    }

    const includeDummy = formData.get("includeDummy") === "on";
    const db = createAdminClient();

    const { count } = await db.from("auto_scores").select("team_id", { count: "exact", head: true });
    if (!count) throw new UserError("Run auto-scoring first: judges are assigned to the top teams by auto-score.");
    const { data: judges } = await db.from("profiles").select("user_id, display_name").eq("role", "judge").order("display_name");
    if (!judges?.length) throw new UserError("There are no judge accounts. Run the seed script or create judges first.");

    const board = (await getLeaderboard(db)).filter((r) => includeDummy || !r.is_dummy).slice(0, topN);
    const k = Math.min(perTeam, judges.length);
    const rows: { judge_id: string; team_id: string }[] = [];
    let cursor = 0;
    for (const team of board) {
      for (let j = 0; j < k; j++) rows.push({ judge_id: judges[(cursor + j) % judges.length].user_id, team_id: team.id });
      cursor = (cursor + k) % judges.length;
    }

    // Keep assignments for shortlisted teams (presentation scoring), replace the rest.
    const { data: sl } = await db.from("shortlist").select("team_id");
    const keep = new Set((sl ?? []).map((s) => s.team_id));
    const del = db.from("judge_assignments").delete();
    const { error: delErr } = keep.size ? await del.not("team_id", "in", `(${[...keep].join(",")})`) : await del.neq("team_id", "00000000-0000-0000-0000-000000000000");
    if (delErr) throw new Error(delErr.message);
    if (rows.length) {
      const { error } = await db.from("judge_assignments").upsert(rows, { ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    revalidatePath("/admin", "layout");
    return `Assigned ${board.length} teams to ${judges.length} judges (${k} per team).`;
  });
}

/** Shortlist the top M teams by total; presentation order = rank. */
export async function createShortlist(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const size = Math.max(1, Math.min(50, Number(formData.get("size") || 10)));
    if (!JUDGING_ADMIN_PHASES.includes((await phase()) as EventPhase)) {
      throw new UserError("Judging is set up after submissions are closed (phase Closed or Presentations).");
    }

    const includeDummy = formData.get("includeDummy") === "on";
    const db = createAdminClient();
    const { count: existing } = await db.from("shortlist").select("team_id", { count: "exact", head: true });
    const { count: presScores } = await db.from("judge_scores").select("team_id", { count: "exact", head: true }).eq("criterion", "presentation");
    if ((existing || presScores) && !confirmed(formData)) {
      throw new UserError(
        `A shortlist already exists${presScores ? ` and ${presScores} presentation score(s) were given` : ""}. Re-creating it can change who presents. Tick “replace” to continue.`,
      );
    }
    const full = (await getLeaderboard(db)).filter((r) => includeDummy || !r.is_dummy);
    const unfinished = full.filter((r) => r.judgesAssigned > 0 && r.judgeCount < r.judgesAssigned).length;
    if (unfinished > 0 && formData.get("incomplete") !== "on") {
      throw new UserError(
        `${unfinished} assigned team(s) are not fully judged yet, so the shortlist would favour teams that are. Wait for the judges, or tick “shortlist anyway”.`,
      );
    }
    const board = full.slice(0, size);
    await db.from("shortlist").delete().neq("team_id", "00000000-0000-0000-0000-000000000000");
    if (board.length) {
      const { error } = await db.from("shortlist").insert(board.map((r, i) => ({ team_id: r.id, presentation_order: i + 1 })));
      if (error) throw new Error(error.message);
    }
    // Every judge can score presentations of shortlisted teams.
    const { data: judges } = await db.from("profiles").select("user_id").eq("role", "judge");
    const extra = board.flatMap((r) => (judges ?? []).map((j) => ({ judge_id: j.user_id, team_id: r.id })));
    if (extra.length) await db.from("judge_assignments").upsert(extra, { ignoreDuplicates: true });
    revalidatePath("/admin", "layout");
    return `Shortlisted ${board.length} teams. Every judge can now score their presentations.`;
  });
}
