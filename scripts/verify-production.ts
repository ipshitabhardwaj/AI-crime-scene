/**
 * Production self-check.   npm run verify:prod  [-- --test-pin]
 *
 * Run it on the organiser's laptop against the REAL project (it reads
 * .env.local; variables already set in the shell win). It never prints keys.
 *
 * Checks what can be checked automatically:
 *   environment variables · migration version · RLS / functions / grants /
 *   indexes (database function verify_installation, migration 0004) · the
 *   API "Max rows" cap · public sign-up + email provider (Auth /settings) ·
 *   optionally (--test-pin) that a 6-digit PIN is accepted as a password
 *   (creates and immediately deletes a throwaway user) · login capacity
 *   against the limit you recorded in SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN.
 * Everything that only the Supabase dashboard can show is printed as MANUAL.
 * Exit code 1 if any check FAILS.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { capacitySettings, planAuthCapacity } from "../lib/capacity";

// ---- load .env.local without overriding the shell ------------------------
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

type Status = "PASS" | "WARN" | "FAIL" | "MANUAL" | "INFO";
const results: { s: Status; area: string; msg: string }[] = [];
const out = (s: Status, area: string, msg: string) => {
  results.push({ s, area, msg });
  console.log(`${s.padEnd(6)} ${area.padEnd(9)} ${msg}`);
};

const env = process.env;
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const jwtRole = (k: string) => {
  try {
    const p = k.split(".")[1];
    return p ? (JSON.parse(Buffer.from(p, "base64url").toString()) as { role?: string }).role ?? null : null;
  } catch {
    return null;
  }
};

async function main() {
  // ---------------------------------------------------------------- env
  if (!url) out("FAIL", "env", "NEXT_PUBLIC_SUPABASE_URL is not set");
  else if (url.includes("YOUR-PROJECT")) out("FAIL", "env", "NEXT_PUBLIC_SUPABASE_URL is still the placeholder");
  else if (!url.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(url)) out("FAIL", "env", "NEXT_PUBLIC_SUPABASE_URL must use https://");
  else out(/\.supabase\.co\/?$/.test(url) ? "PASS" : "WARN", "env", `Supabase URL ${/\.supabase\.co\/?$/.test(url) ? "looks like a hosted project" : "is not *.supabase.co (fine for local testing only)"}`);

  if (!anon) out("FAIL", "env", "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  else if (anon.startsWith("sb_secret_") || jwtRole(anon) === "service_role") out("FAIL", "env", "NEXT_PUBLIC_SUPABASE_ANON_KEY holds the SECRET key — it would be public. Use the publishable/anon key.");
  else out("PASS", "env", "public (anon/publishable) key is set and is not the secret key");

  if (!service) out("FAIL", "env", "SUPABASE_SERVICE_ROLE_KEY is not set");
  else if (service === anon || service.startsWith("sb_publishable_") || jwtRole(service) === "anon") out("FAIL", "env", "SUPABASE_SERVICE_ROLE_KEY is the public key, not the secret key");
  else out("PASS", "env", "secret (service role) key is set and differs from the public key");

  const leaked = Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_") && service && env[k] === service);
  if (leaked.length) out("FAIL", "env", `the secret key is stored in public variable(s): ${leaked.join(", ")}`);
  if (Object.keys(env).some((k) => k.startsWith("NEXT_PUBLIC_") && /SERVICE|SECRET/.test(k))) out("FAIL", "env", "a NEXT_PUBLIC_ variable name contains SERVICE/SECRET — it is sent to browsers");

  if (!env.NEXT_PUBLIC_TEAM_EMAIL_DOMAIN) out("WARN", "env", "NEXT_PUBLIC_TEAM_EMAIL_DOMAIN not set (default teams.aifiles.local); it must be identical on Vercel and in the seed");
  else out("PASS", "env", `team login domain: ${env.NEXT_PUBLIC_TEAM_EMAIL_DOMAIN}`);
  if (!env.NEXT_PUBLIC_SITE_URL) out("WARN", "env", "NEXT_PUBLIC_SITE_URL not set (printed on credential slips)");
  else out(env.NEXT_PUBLIC_SITE_URL.startsWith("https://") ? "PASS" : "WARN", "env", `site URL: ${env.NEXT_PUBLIC_SITE_URL}`);
  out("INFO", "env", "SEED_* variables are only for `npm run seed` on your laptop; do not add them to Vercel");

  if (!url || !service) return;
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---------------------------------------------------------- database
  const { data: checks, error: vErr } = await db.rpc("verify_installation");
  if (vErr) out("FAIL", "database", `verify_installation() failed: ${vErr.message} — is migration 0004 applied?`);
  else for (const c of checks as { check_name: string; ok: boolean; detail: string }[]) out(c.ok ? "PASS" : "FAIL", "database", `${c.check_name}: ${c.detail}`);

  const { data: rows, error: mErr } = await db.rpc("verify_max_rows", { p_n: 2500 });
  if (mErr) out("FAIL", "api", `Max rows check failed: ${mErr.message}`);
  else {
    const n = (rows as unknown[]).length;
    out(n >= 1000 ? "PASS" : "FAIL", "api", `API "Max rows" cap = ${n >= 2500 ? "≥ 2500" : n} (must be ≥ 1000; the app pages in blocks of 1000)`);
  }

  const [ev, cases, teams, judges, admins] = await Promise.all([
    db.from("event").select("phase").eq("id", 1).maybeSingle(),
    db.from("cases").select("code"),
    db.from("teams").select("is_dummy"),
    db.from("profiles").select("user_id", { count: "exact", head: true }).eq("role", "judge"),
    db.from("profiles").select("user_id", { count: "exact", head: true }).eq("role", "admin"),
  ]);
  out("INFO", "data", `phase: ${ev.data?.phase ?? "?"}`);
  const codes = (cases.data ?? []).map((c) => c.code as string);
  out(codes.length >= 1 ? "PASS" : "FAIL", "data", `cases loaded: ${codes.join(", ") || "none"}`);
  if (codes.some((c) => c.includes("SAMPLE"))) out("WARN", "data", "CASE-SAMPLE is still loaded — delete it before importing real teams");
  const teamRows = (teams.data ?? []) as { is_dummy: boolean }[];
  const realTeams = teamRows.filter((t) => !t.is_dummy).length;
  out("INFO", "data", `teams: ${teamRows.length} (${realTeams} real, ${teamRows.length - realTeams} dummy)`);
  out((judges.count ?? 0) > 0 ? "PASS" : "WARN", "data", `judge accounts: ${judges.count ?? 0}`);
  out((admins.count ?? 0) > 0 ? "PASS" : "FAIL", "data", `admin accounts: ${admins.count ?? 0}`);

  // -------------------------------------------------------------- auth
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: anon || service } });
    const s = (await r.json()) as { disable_signup?: boolean; external?: { email?: boolean } };
    out(s.external?.email ? "PASS" : "FAIL", "auth", `email/password provider ${s.external?.email ? "enabled" : "DISABLED (team logins will fail)"}`);
    out(s.disable_signup ? "PASS" : "WARN", "auth", s.disable_signup ? "public sign-ups disabled" : "public sign-ups are ENABLED — anyone with the public key can create an (empty, role-less) account; turn off “Allow new users to sign up”");
  } catch (e) {
    out("WARN", "auth", `could not read Auth settings: ${e instanceof Error ? e.message : e}`);
  }

  if (process.argv.includes("--test-pin")) {
    const domain = env.NEXT_PUBLIC_TEAM_EMAIL_DOMAIN ?? "teams.aifiles.local";
    const email = `verify-${randomInt(1e9)}@${domain}`;
    const { data, error } = await db.auth.admin.createUser({ email, password: String(randomInt(100000, 999999)), email_confirm: true, app_metadata: { role: "verify" } });
    if (error) out("FAIL", "auth", `a 6-digit PIN was rejected as a password: ${error.message}`);
    else {
      out("PASS", "auth", "a 6-digit PIN is accepted as a password");
      await db.auth.admin.deleteUser(data.user!.id);
    }
  } else out("MANUAL", "auth", "password rules allow a 6-digit PIN (or run with -- --test-pin to test it for real)");

  const cap = capacitySettings(env);
  const plan = planAuthCapacity({ teams: realTeams || teamRows.length || 70, devicesPerTeam: cap.devicesPerTeam, loginWindowMinutes: cap.loginWindowMinutes });
  const basis = `${realTeams || teamRows.length || 70} teams × ${cap.devicesPerTeam} devices, logins within ${cap.loginWindowMinutes} min → recommended ≥ ${plan.recommendedPer5Min} sign-ins+refreshes per 5 min`;
  if (!cap.configuredLimitPer5Min) out("MANUAL", "auth", `rate limit: ${basis}. Read the current value in the dashboard, then record it as SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN`);
  else out(cap.configuredLimitPer5Min >= plan.recommendedPer5Min ? "PASS" : "FAIL", "auth", `rate limit recorded as ${cap.configuredLimitPer5Min}; ${basis}`);

  for (const m of [
    "Authentication → Rate Limits: note the name, unit (per 5 min / per hour) and value of the sign-in / token-refresh limit; confirm it is per IP",
    "Authentication → Sessions (if your plan has it): single session per user, time-box and inactivity timeout are OFF (teams share one login)",
    "Authentication → Providers → Email: leaked-password protection OFF (a 6-digit PIN would be rejected)",
    "Project Settings → JWT Keys: note the access-token expiry (default 3600 s) and whether signing keys are asymmetric",
    "Project home: plan and region (Mumbai); a paused Free project must be resumed before event day",
    "Vercel: SUPABASE_SERVICE_ROLE_KEY marked Sensitive, not NEXT_PUBLIC_; Preview deployments do not use production keys",
    "Run supabase/tests/security_checks.sql in the SQL Editor: it must end with ALL SECURITY CHECKS PASSED",
  ]) out("MANUAL", "dashboard", m);
}

main()
  .catch((e) => out("FAIL", "script", e instanceof Error ? e.message : String(e)))
  .finally(() => {
    const n = (s: Status) => results.filter((r) => r.s === s).length;
    console.log(`\n${n("PASS")} pass · ${n("WARN")} warn · ${n("FAIL")} fail · ${n("MANUAL")} manual`);
    if (n("FAIL")) process.exitCode = 1;
  });
