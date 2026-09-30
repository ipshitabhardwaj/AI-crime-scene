"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_HOME, normaliseTeamCode, teamCodeToEmail, type AppRole } from "@/lib/constants";

export type LoginState = { error: string | null };

/**
 * Throttle: after 8 wrong attempts for one team code / email within 10
 * minutes, that login is paused for 5 minutes. A 6-digit PIN therefore
 * cannot be brute-forced, and one team typing wrong PINs never blocks others.
 * (All participants share the college's IP address, so there is no per-IP limit.)
 */
const MAX_FAILURES = 8;
const WINDOW_MS = 10 * 60_000;
const LOCK_MS = 5 * 60_000;

async function throttleCheck(key: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from("login_attempts").select("locked_until").eq("key", key).maybeSingle();
    if (data?.locked_until && new Date(data.locked_until).getTime() > Date.now()) {
      const mins = Math.ceil((new Date(data.locked_until).getTime() - Date.now()) / 60_000);
      return `Too many wrong attempts. Try again in ${mins} minute(s), or ask the organisers.`;
    }
  } catch {
    /* never block logins because the throttle table is unavailable */
  }
  return null;
}

async function recordFailure(key: string) {
  try {
    await createAdminClient().rpc("record_login_failure", {
      p_key: key,
      p_max: MAX_FAILURES,
      p_window_s: WINDOW_MS / 1000,
      p_lock_s: LOCK_MS / 1000,
    });
  } catch {
    /* best effort */
  }
}

async function clearFailures(key: string) {
  try {
    await createAdminClient().from("login_attempts").delete().eq("key", key);
  } catch {
    /* best effort */
  }
}

async function signInAndRedirect(key: string, email: string, password: string, expect: "team" | "staff"): Promise<LoginState> {
  const blocked = await throttleCheck(key);
  if (blocked) return { error: blocked };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.status === 429) {
      return { error: "The login server is busy (many people are logging in). Wait 30 seconds and try again." };
    }
    if (error && error.status && error.status >= 500) return { error: "The login server did not respond. Try again in a moment." };
    await recordFailure(key);
    return { error: expect === "team" ? "Wrong team code or PIN." : "Wrong email or password." };
  }
  await clearFailures(key);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle<{ role: AppRole }>();

  if (!profile) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "This account is not set up for the event. Ask the organisers." };
  }
  if (expect === "team" && profile.role !== "team") {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Use the Organisers tab to log in." };
  }

  redirect(ROLE_HOME[profile.role]);
}

export async function loginTeam(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const code = normaliseTeamCode(String(formData.get("code") ?? "")).slice(0, 20);
  const pin = String(formData.get("pin") ?? "").trim().slice(0, 20);
  if (!code || !pin) return { error: "Enter your team code and PIN." };
  if (!/^[A-Z0-9-]+$/.test(code)) return { error: "Team codes look like AIF-014." };
  return signInAndRedirect(`team:${code}`, teamCodeToEmail(code), pin, "team");
}

export async function loginStaff(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: "Enter your email and password." };
  return signInAndRedirect(`staff:${email}`, email, password, "staff");
}

/**
 * Log out THIS device only. Teams share one account across several laptops,
 * so the default (global) sign-out would end every teammate's session.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
