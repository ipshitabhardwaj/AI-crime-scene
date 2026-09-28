"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserError, runAction } from "@/lib/admin-action";
import { requireRole } from "@/lib/auth";
import { teamCodeToEmail } from "@/lib/constants";
import { selectAll } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = "/admin/teams";

const RowSchema = z.object({
  name: z.string().trim().max(80),
  institution: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  members: z.array(z.string().trim().max(80)).max(8).default([]),
  source: z.record(z.string(), z.string().max(2000)).optional(),
});
export type ImportRow = z.input<typeof RowSchema>;

export type ImportResult = {
  created: { code: string; pin: string; name: string }[];
  skipped: { name: string; reason: string }[]; // duplicates / blank: nothing to do
  failed: { name: string; reason: string }[]; // real errors: needs attention
};

const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function currentPhase() {
  const db = createAdminClient();
  const { data } = await db.from("event").select("phase").eq("id", 1).single();
  return (data?.phase ?? "waiting") as string;
}

/**
 * Create teams + logins. Called in chunks of ≤ 25 rows by the import screen so
 * each server call stays short. Skips rows whose team name or leader email
 * already exists (so re-uploading the same CSV is safe) and reports every row.
 */
export async function importTeams(rows: ImportRow[]): Promise<ImportResult> {
  await requireRole("admin");
  if (!Array.isArray(rows) || rows.length > 25) throw new Error("Send at most 25 rows per call.");
  const db = createAdminClient();
  const result: ImportResult = { created: [], skipped: [], failed: [] };

  const [existing, { data: cases }] = await Promise.all([
    selectAll<{ team_code: string; name: string; contact_email: string | null }>((a, b) =>
      db.from("teams").select("team_code, name, contact_email").range(a, b),
    ),
    db.from("cases").select("id, code").order("code"),
  ]);
  const names = new Set(existing.map((t) => t.name.trim().toLowerCase()));
  const emails = new Set(existing.map((t) => t.contact_email?.trim().toLowerCase()).filter(Boolean));
  let next = Math.max(0, ...existing.map((t) => Number(/^AIF-(\d+)$/.exec(t.team_code)?.[1] ?? 0))) + 1;
  const caseIds = (cases ?? []).map((c) => c.id);

  for (const raw of rows) {
    const parsed = RowSchema.safeParse(raw);
    if (!parsed.success) {
      result.failed.push({ name: String((raw as { name?: unknown })?.name ?? "(unknown)").slice(0, 80), reason: parsed.error.issues[0]?.message ?? "Invalid row" });
      continue;
    }
    const row = parsed.data;
    const name = row.name.replace(/\s+/g, " ");
    const email = row.email.toLowerCase() || null;
    if (!name) {
      result.skipped.push({ name: "(blank)", reason: "No team name" });
      continue;
    }
    if (names.has(name.toLowerCase())) {
      result.skipped.push({ name, reason: "Team name already exists" });
      continue;
    }
    if (email && !EMAIL.test(email)) {
      result.failed.push({ name, reason: `Invalid email “${email}”. Fix it in the sheet or add the team manually.` });
      continue;
    }
    if (email && emails.has(email)) {
      result.skipped.push({ name, reason: `Email ${email} already registered for another team` });
      continue;
    }

    const num = next++;
    const code = `AIF-${String(num).padStart(3, "0")}`;
    const pin = newPin();
    const members = row.members.filter(Boolean).map((m) => ({ name: m }));

    const { data: team, error: teamErr } = await db
      .from("teams")
      .insert({
        team_code: code,
        name,
        institution: row.institution || null,
        contact_email: email,
        contact_phone: row.phone || null,
        members,
        case_id: caseIds.length ? caseIds[(num - 1) % caseIds.length] : null,
        source_row: row.source ?? null,
      })
      .select("id")
      .single();
    if (teamErr) {
      result.failed.push({ name, reason: teamErr.message });
      continue;
    }

    const { data: auth, error: authErr } = await db.auth.admin.createUser({
      email: teamCodeToEmail(code),
      password: pin,
      email_confirm: true,
      app_metadata: { role: "team", team_id: team.id },
    });
    if (authErr || !auth.user) {
      await db.from("teams").delete().eq("id", team.id);
      result.failed.push({ name, reason: `Login not created: ${authErr?.message ?? "unknown error"}` });
      continue;
    }

    const results = await Promise.all([
      db.from("teams").update({ auth_user_id: auth.user.id }).eq("id", team.id),
      db.from("team_credentials").insert({ team_id: team.id, pin }),
      db.from("profiles").insert({ user_id: auth.user.id, role: "team", team_id: team.id, display_name: name }),
    ]);
    const bad = results.find((r) => r.error);
    if (bad) {
      await db.auth.admin.deleteUser(auth.user.id);
      await db.from("teams").delete().eq("id", team.id);
      result.failed.push({ name, reason: `Setup failed: ${bad.error!.message}` });
      continue;
    }

    names.add(name.toLowerCase());
    if (email) emails.add(email);
    result.created.push({ code, pin, name });
  }

  revalidatePath("/admin", "layout");
  return result;
}

/** Manual "Add team" form (on-the-spot registrations). */
export async function addTeam(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const members = String(formData.get("members") ?? "").split(/[,\n]/);
    const r = await importTeams([
      {
        name: String(formData.get("name") ?? ""),
        institution: String(formData.get("institution") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        members,
      },
    ]);
    const problem = r.failed[0] ?? r.skipped[0];
    if (problem) throw new UserError(`Not created: ${problem.reason}`);
    const c = r.created[0];
    return `Created ${c.code} “${c.name}”. PIN: ${c.pin}`;
  });
}

export async function setCheckedIn(formData: FormData) {
  await requireRole("admin");
  await runAction(String(formData.get("back") || PATH), async () => {
    const db = createAdminClient();
    const value = formData.get("value") === "true";
    const { data } = await db.from("teams").update({ checked_in: value }).eq("id", String(formData.get("teamId"))).select("team_code").single();
    revalidatePath("/admin", "layout");
    return `${data?.team_code ?? "Team"} ${value ? "checked in" : "check-in removed"}.`;
  });
}

/** Changing a team's case is only safe before it has done any work. */
export async function setTeamCase(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const db = createAdminClient();
    const teamId = String(formData.get("teamId"));
    const caseId = String(formData.get("caseId") || "") || null;
    const [{ count: tags }, { count: subs }] = await Promise.all([
      db.from("evidence_tags").select("team_id", { count: "exact", head: true }).eq("team_id", teamId),
      db.from("submissions").select("team_id", { count: "exact", head: true }).eq("team_id", teamId),
    ]);
    if ((tags ?? 0) + (subs ?? 0) > 0) throw new UserError("This team has already started working on its case, so its case can’t be changed.");
    const { data } = await db.from("teams").update({ case_id: caseId }).eq("id", teamId).select("team_code").single();
    revalidatePath("/admin", "layout");
    return `${data?.team_code} case updated.`;
  });
}

export async function resetPin(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    const db = createAdminClient();
    const teamId = String(formData.get("teamId"));
    const { data: team } = await db.from("teams").select("team_code, auth_user_id").eq("id", teamId).single();
    if (!team?.auth_user_id) throw new UserError("This team has no login.");
    const pin = newPin();
    const { error } = await db.auth.admin.updateUserById(team.auth_user_id, { password: pin });
    if (error) throw new Error(error.message);
    await db.from("team_credentials").upsert({ team_id: teamId, pin, updated_at: new Date().toISOString() });
    await db.from("login_attempts").delete().eq("key", `team:${team.team_code}`);
    revalidatePath("/admin", "layout");
    return `New PIN for ${team.team_code}: ${pin}`;
  });
}

async function deleteTeams(ids: string[]) {
  const db = createAdminClient();
  const teams = await selectAll<{ id: string; auth_user_id: string | null }>((a, b) =>
    db.from("teams").select("id, auth_user_id").in("id", ids).range(a, b),
  );
  for (const t of teams) {
    if (t.auth_user_id) await db.auth.admin.deleteUser(t.auth_user_id); // cascades to profile
    await db.from("teams").delete().eq("id", t.id); // cascades to work, scores, PIN
  }
  return teams.length;
}

export async function deleteTeam(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    if (String(formData.get("confirm")).trim() !== "DELETE") throw new UserError("Type DELETE to confirm.");
    const n = await deleteTeams([String(formData.get("teamId"))]);
    revalidatePath("/admin", "layout");
    return n ? "Team, its login and all its work deleted." : "Team not found.";
  });
}

export async function deleteDummyTeams(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    if (String(formData.get("confirm")).trim() !== "DELETE") throw new UserError("Type DELETE to confirm.");
    const db = createAdminClient();
    const ids = (await selectAll<{ id: string }>((a, b) => db.from("teams").select("id").eq("is_dummy", true).range(a, b))).map((t) => t.id);
    const n = await deleteTeams(ids);
    revalidatePath("/admin", "layout");
    return `Deleted ${n} dummy teams and their logins.`;
  });
}

/** After a dry run with real-looking test teams: remove every team. Waiting phase only. */
export async function deleteAllTeams(formData: FormData) {
  await requireRole("admin");
  await runAction(PATH, async () => {
    if (String(formData.get("confirm")).trim() !== "DELETE ALL TEAMS") throw new UserError("Type DELETE ALL TEAMS to confirm.");
    if ((await currentPhase()) !== "waiting") throw new UserError("Only possible while the event is in Waiting. Reset the event first.");
    const db = createAdminClient();
    const ids = (await selectAll<{ id: string }>((a, b) => db.from("teams").select("id").range(a, b))).map((t) => t.id);
    const n = await deleteTeams(ids);
    revalidatePath("/admin", "layout");
    return `Deleted all ${n} teams and their logins. Cases, judges and admins were kept.`;
  });
}

/** Spread teams over the cases again (round-robin by team code). Waiting phase only. */
export async function rebalanceCases() {
  await requireRole("admin");
  await runAction(PATH, async () => {
    if ((await currentPhase()) !== "waiting") {
      throw new UserError("Cases can only be rebalanced before the investigation starts (phase Waiting). Teams already have work on their current case.");
    }
    const db = createAdminClient();
    const [teams, { data: cases }] = await Promise.all([
      selectAll<{ id: string; team_code: string }>((a, b) => db.from("teams").select("id, team_code").order("team_code").range(a, b)),
      db.from("cases").select("id").order("code"),
    ]);
    if (!cases?.length) throw new UserError("Upload at least one case first.");
    for (const [i, t] of teams.entries()) {
      await db.from("teams").update({ case_id: cases[i % cases.length].id }).eq("id", t.id);
    }
    revalidatePath("/admin", "layout");
    return `${teams.length} teams spread over ${cases.length} cases.`;
  });
}
