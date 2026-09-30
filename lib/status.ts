import "server-only";
import { selectAll } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

export type TeamStatus = {
  team_id: string;
  team_code: string;
  name: string;
  case_code: string | null;
  checked_in: boolean;
  is_dummy: boolean;
  extra_minutes: number;
  /** extension for the phase that is running now */
  phase_extra_minutes: number;
  has_login: boolean;
  tags: number;
  tl_initial: number;
  tl_final: number;
  initial_state: "submitted" | "auto-locked" | "draft" | null;
  final_state: "submitted" | "auto-locked" | "draft" | null;
  last_activity: string | null;
};

/** One aggregated row per team (database function admin_team_status, migration 0004). */
export async function getTeamStatus(): Promise<TeamStatus[]> {
  const db = createAdminClient();
  return selectAll<TeamStatus>((a, b) => db.rpc("admin_team_status").range(a, b));
}
