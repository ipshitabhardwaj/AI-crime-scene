"use server";

import { revalidatePath } from "next/cache";
import { UserError, confirmed, runAction } from "@/lib/admin-action";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHASES, phaseInfo, type EventPhase } from "@/lib/constants";

/**
 * Event control. Every phase change goes through goToPhase so the side
 * effects always happen, whichever button the organiser uses:
 *   leaving investigation      -> lock all initial submissions
 *   entering twist or later    -> release twist, give teams a final copy
 *   entering closed or later   -> lock all final submissions
 * All side effects are idempotent (safe to repeat).
 *
 * Guards: steps that lock work, release the twist or reveal results need a
 * ticked confirmation; moving BACKWARDS needs the word BACK typed; revealing
 * results needs auto-scores; starting with case-less teams needs a confirmation.
 */
const ORDER: EventPhase[] = PHASES.map((p) => p.id);
const idx = (p: EventPhase) => ORDER.indexOf(p);
const NEEDS_CONFIRM: EventPhase[] = ["initial_locked", "twist", "closed", "results"];
const PATH = "/admin/control";

async function goToPhase(phase: EventPhase, minutes: number) {
  const db = createAdminClient();
  const { data: current, error: readErr } = await db.from("event").select("*").eq("id", 1).single();
  if (readErr) throw new Error(readErr.message);

  if (idx(phase) > idx("investigation")) {
    const { error } = await db.rpc("admin_lock_stage", { p_stage: "initial" });
    if (error) throw new Error(`Locking initial submissions failed: ${error.message}`);
  }
  if (idx(phase) >= idx("twist")) {
    const { error } = await db.rpc("admin_prepare_final");
    if (error) throw new Error(`Preparing final drafts failed: ${error.message}`);
  }
  if (idx(phase) >= idx("closed")) {
    const { error } = await db.rpc("admin_lock_stage", { p_stage: "final" });
    if (error) throw new Error(`Locking final submissions failed: ${error.message}`);
  }

  const twist_released_at = idx(phase) >= idx("twist") ? (current.twist_released_at ?? new Date().toISOString()) : null;
  const phase_ends_at = minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  const { error } = await db
    .from("event")
    .update({ phase, phase_ends_at, twist_released_at, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

/** Form action: `phase`, optional `minutes`, `confirm` checkbox, `override` text. */
export async function setPhase(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const phase = String(formData.get("phase")) as EventPhase;
    if (!ORDER.includes(phase)) throw new UserError("Unknown phase.");
    const minutes = Math.max(0, Math.min(600, Math.round(Number(formData.get("minutes") || 0))));
    const db = createAdminClient();
    const { data: ev } = await db.from("event").select("phase").eq("id", 1).single();
    const current = (ev?.phase ?? "waiting") as EventPhase;

    if (phase === current) throw new UserError(`Already in “${phaseInfo(phase).label}”. Use “Change timer” to adjust the time.`);
    if (idx(phase) < idx(current) && String(formData.get("override") ?? "").trim().toUpperCase() !== "BACK") {
      throw new UserError(`Going back from “${phaseInfo(current).label}” to “${phaseInfo(phase).label}” is unusual. Locked submissions stay locked. Type BACK to confirm.`);
    }
    if (idx(phase) > idx(current) && (NEEDS_CONFIRM.includes(phase) || idx(phase) - idx(current) > 1) && !confirmed(formData)) {
      throw new UserError(`Tick “I’m sure” to move to “${phaseInfo(phase).label}”. This cannot be undone for teams.`);
    }
    if (phase === "investigation") {
      const { count } = await db.from("teams").select("id", { count: "exact", head: true }).is("case_id", null);
      if ((count ?? 0) > 0 && !confirmed(formData)) {
        throw new UserError(`${count} team(s) have no case and would see nothing. Assign cases (Teams → Rebalance) or tick “I’m sure”.`);
      }
    }
    if (phase === "results") {
      const { count } = await db.from("auto_scores").select("team_id", { count: "exact", head: true });
      if (!count) throw new UserError("Run auto-scoring on the Results page before revealing results.");
    }

    await goToPhase(phase, minutes);
    revalidatePath("/admin", "layout");
    return `Phase is now “${phaseInfo(phase).label}”${minutes ? ` with a ${minutes}-minute timer` : ""}.`;
  });
}

/** Set (or clear) the timer of the CURRENT phase without any other effect. */
export async function setTimer(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const minutes = Math.max(0, Math.min(600, Math.round(Number(formData.get("minutes") || 0))));
    const db = createAdminClient();
    const phase_ends_at = minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    const { error } = await db.from("event").update({ phase_ends_at, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    revalidatePath("/admin", "layout");
    return minutes ? `Timer set: ${minutes} minutes from now.` : "Timer removed.";
  });
}

/** Push the current deadline back by N minutes (negative to shorten). */
export async function extendDeadline(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const minutes = Math.round(Number(formData.get("minutes") || 0));
    if (!minutes || Math.abs(minutes) > 120) throw new UserError("Enter a number of minutes between -120 and 120.");
    const db = createAdminClient();
    const { data } = await db.from("event").select("phase_ends_at").eq("id", 1).single();
    if (!data?.phase_ends_at) throw new UserError("There is no timer running.");
    const next = new Date(new Date(data.phase_ends_at).getTime() + minutes * 60_000).toISOString();
    await db.from("event").update({ phase_ends_at: next, updated_at: new Date().toISOString() }).eq("id", 1);
    revalidatePath("/admin", "layout");
    return `Deadline moved ${minutes > 0 ? "later" : "earlier"} by ${Math.abs(minutes)} min.`;
  });
}

/** Give one team extra minutes (e.g. laptop died). Cumulative, never below 0. */
export async function addTeamMinutes(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const teamId = String(formData.get("teamId"));
    const minutes = Math.round(Number(formData.get("minutes") || 0));
    const db = createAdminClient();
    const { data, error } = await db.from("teams").select("team_code, extra_minutes").eq("id", teamId).single();
    if (error || !data) throw new UserError("Team not found.");
    const extra = Math.max(0, Math.min(120, data.extra_minutes + minutes));
    await db.from("teams").update({ extra_minutes: extra }).eq("id", teamId);
    revalidatePath("/admin", "layout");
    return `${data.team_code} now has +${extra} min.`;
  });
}

/** Unlock one team's submission for a stage (team submitted by mistake). */
export async function unlockSubmission(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const teamId = String(formData.get("teamId"));
    const stage = String(formData.get("stage"));
    if (stage !== "initial" && stage !== "final") throw new UserError("Unknown stage.");
    const db = createAdminClient();
    const { data: ev } = await db.from("event").select("phase").eq("id", 1).single();
    const open = stage === "initial" ? ev?.phase === "investigation" : ev?.phase === "twist" || ev?.phase === "final";
    if (!open) throw new UserError(`The ${stage} report can only be unlocked while its phase is running.`);
    await db.from("submissions").update({ locked: false, submitted_at: null }).eq("team_id", teamId).eq("stage", stage);
    revalidatePath("/admin", "layout");
    return `Unlocked the ${stage} report. The team must submit again.`;
  });
}

/** Dry-run reset: wipes team work and scores, keeps teams, cases and logins. */
export async function resetEvent(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    if (String(formData.get("confirm")).trim() !== "RESET") throw new UserError("Type RESET (capitals) to confirm.");
    const db = createAdminClient();
    const { error } = await db.rpc("admin_reset_event");
    if (error) throw new Error(error.message);
    revalidatePath("/admin", "layout");
    return "Event reset: all tags, timelines, reports, scores, judge assignments and the shortlist were deleted. Phase is Waiting. Teams, cases and logins were kept.";
  });
}
