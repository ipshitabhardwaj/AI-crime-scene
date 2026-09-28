import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME, type AppRole } from "@/lib/constants";
import type { Profile, Team } from "@/lib/types";

export type Session = {
  userId: string;
  email: string | null;
  profile: Profile;
  team: Team | null;
};

/**
 * Current user + profile (+ team for team accounts), or null if not logged in.
 * Cached per request, so a layout and its page share one lookup.
 * getClaims() verifies the JWT locally when the project uses asymmetric
 * signing keys (no Auth round-trip) and falls back to the Auth server otherwise.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, role, team_id, display_name")
    .eq("user_id", userId)
    .maybeSingle<Profile>();
  if (!profile) return null;

  let team: Team | null = null;
  if (profile.team_id) {
    const { data: t } = await supabase.from("teams").select("*").eq("id", profile.team_id).maybeSingle<Team>();
    team = t;
  }

  return { userId, email: (data.claims.email as string | undefined) ?? null, profile, team };
});

/** Use at the top of every protected layout / page / server action. */
export async function requireRole(role: AppRole): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.profile.role !== role) redirect(ROLE_HOME[session.profile.role]);
  return session;
}
