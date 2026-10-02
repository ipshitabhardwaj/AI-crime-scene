import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reset the event: delete all team work, scores, judge assignments, the
 * shortlist and extra time, and go back to Waiting. Keeps teams, logins,
 * cases, judges and admins. Needs a service-role client.
 *
 * First tries the database function admin_reset_event() (one transaction).
 * Hosted Supabase refuses a DELETE or UPDATE without a WHERE clause, which
 * the function contained before migration 0005; in that case the same steps
 * are done here, one table at a time, each with a filter.
 */
export async function resetEventData(db: SupabaseClient): Promise<"function" | "step-by-step"> {
  const { error } = await db.rpc("admin_reset_event");
  if (!error) return "function";
  if (!/WHERE clause/i.test(error.message)) throw new Error(error.message);

  const clear = async (table: string, column: string) => {
    const { error: e } = await db.from(table).delete().not(column, "is", null);
    if (e) throw new Error(`Reset stopped at ${table}: ${e.message}`);
  };
  for (const table of ["shortlist", "judge_scores", "judge_assignments", "auto_scores", "submissions", "timeline_entries", "evidence_tags", "work_versions"]) {
    await clear(table, "team_id");
  }
  await clear("login_attempts", "key");
  const teams = await db.from("teams").update({ extra_minutes: 0, phase_extra_minutes: 0, phase_extra_phase: null }).not("id", "is", null);
  if (teams.error) throw new Error(`Reset stopped at teams: ${teams.error.message}`);
  // Last, so a failure above leaves the phase unchanged and the reset can simply be run again.
  const ev = await db.from("event").update({ phase: "waiting", phase_ends_at: null, twist_released_at: null, updated_at: new Date().toISOString() }).eq("id", 1);
  if (ev.error) throw new Error(`Reset stopped at event: ${ev.error.message}`);
  return "step-by-step";
}
