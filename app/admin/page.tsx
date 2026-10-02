import Link from "next/link";
import AutoRefresh from "@/components/admin/AutoRefresh";
import { PageHeader, Progress, Section, Stat } from "@/components/ui";
import { capacitySettings, planAuthCapacity } from "@/lib/capacity";
import { phaseInfo } from "@/lib/constants";
import { getEvent } from "@/lib/event";
import { getTeamStatus } from "@/lib/status";
import { nowMs } from "@/lib/time";
import { createAdminClient } from "@/lib/supabase/admin";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const db = createAdminClient();
  const event = await getEvent();
  const [teams, cases, judges, autos, assignments, scores, shortlist] = await Promise.all([
    getTeamStatus(),
    db.from("cases").select("code, evidence(count)").order("code").returns<{ code: string; evidence: { count: number }[] }[]>(),
    db.from("profiles").select("user_id", { count: "exact", head: true }).eq("role", "judge"),
    db.from("auto_scores").select("computed_at", { count: "exact" }).order("computed_at", { ascending: false }).limit(1),
    db.from("judge_assignments").select("team_id", { count: "exact", head: true }),
    db.from("judge_scores").select("team_id", { count: "exact", head: true }),
    db.from("shortlist").select("team_id", { count: "exact", head: true }),
  ]);

  const now = nowMs();
  const n = (f: (t: (typeof teams)[number]) => boolean) => teams.filter(f).length;
  const byCase = new Map<string, number>();
  for (const t of teams) byCase.set(t.case_code ?? "none", (byCase.get(t.case_code ?? "none") ?? 0) + 1);
  const caseList = cases.data ?? [];
  const realCases = caseList.filter((c) => !c.code.includes("SAMPLE"));

  const cap = capacitySettings();
  const realTeams = n((t) => !t.is_dummy);
  const plan = planAuthCapacity({ teams: realTeams || teams.length, devicesPerTeam: cap.devicesPerTeam, loginWindowMinutes: cap.loginWindowMinutes });
  const capOk = cap.configuredLimitPer5Min > 0 && cap.configuredLimitPer5Min >= plan.recommendedPer5Min;

  const ready: { ok: boolean; label: string; detail: string; href: string }[] = [
    { ok: realCases.length > 0, label: "Event cases uploaded", detail: `${realCases.length} case(s): ${realCases.map((c) => c.code).join(", ") || "none"}`, href: "/admin/cases" },
    { ok: !caseList.some((c) => c.code.includes("SAMPLE")), label: "Sample case removed", detail: caseList.some((c) => c.code.includes("SAMPLE")) ? "CASE-SAMPLE is still loaded — delete it" : "OK", href: "/admin/cases" },
    { ok: realTeams > 0, label: "Real teams imported", detail: `${realTeams} real team(s)`, href: "/admin/teams" },
    { ok: n((t) => t.is_dummy) === 0, label: "Dummy teams deleted", detail: n((t) => t.is_dummy) ? `${n((t) => t.is_dummy)} dummy team(s) left` : "OK", href: "/admin/teams" },
    { ok: teams.length > 0 && n((t) => !t.case_code || !t.has_login) === 0, label: "Every team has a case and a login", detail: `${n((t) => !t.case_code)} without case · ${n((t) => !t.has_login)} without login`, href: "/admin/teams" },
    { ok: (judges.count ?? 0) > 0, label: "Judge accounts exist", detail: `${judges.count ?? 0} judge(s)`, href: "/admin/results" },
    {
      ok: capOk,
      label: "Login capacity confirmed",
      detail: cap.configuredLimitPer5Min
        ? `limit ${cap.configuredLimitPer5Min} / 5 min, need ≥ ${plan.recommendedPer5Min}`
        : `need ≥ ${plan.recommendedPer5Min} sign-ins+refreshes / 5 min — check Supabase → Authentication → Rate Limits, then set SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN`,
      href: "/admin",
    },
  ];
  const readyCount = ready.filter((r) => r.ok).length;
  const allReady = readyCount === ready.length;

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={20} />
      <PageHeader
        kicker="Step 1 · before the event"
        title="Setup"
        description={`Now: ${event ? phaseInfo(event.phase).label : "—"}. Work down this list. When everything is green, go to the Control room.`}
        actions={
          <Link href="/admin/control" className={ui.btnLg}>
            Control room →
          </Link>
        }
      />

      <Section title={allReady ? "Ready to go ✓" : "Before the event"} description={`${readyCount} of ${ready.length} done`}>
        <Progress value={readyCount} max={ready.length} tone={allReady ? "ok" : "accent"} label="Setup progress" />
        <ul className="mt-3 divide-y divide-line">
          {ready.map((r) => (
            <li key={r.label} className="flex items-start gap-3 py-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${r.ok ? "bg-ok text-ink" : "bg-accent text-white"}`}>{r.ok ? "✓" : "!"}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.label}</p>
                <p className="text-sm text-muted">{r.detail}</p>
              </div>
              {!r.ok && r.href !== "/admin" && (
                <Link href={r.href} className={ui.btnGhost}>
                  Fix →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Teams" value={teams.length} note={`${n((t) => t.checked_in)} checked in · ${n((t) => !!t.last_activity && now - new Date(t.last_activity).getTime() < 300_000)} active now`} href="/admin/teams" />
        <Stat label="Initial Conclusions" value={n((t) => t.initial_state === "submitted")} note={`submitted · ${n((t) => t.initial_state === "auto-locked")} auto-locked`} href="/admin/status" />
        <Stat label="Final reports" value={n((t) => t.final_state === "submitted")} note={`submitted · ${n((t) => t.final_state === "auto-locked")} auto-locked`} href="/admin/status" />
        <Stat label="Judge scores" value={scores.count ?? 0} note={`${assignments.count ?? 0} assignments · ${judges.count ?? 0} judges`} href="/admin/results" />
      </section>

      <details className="rounded-xl border border-line bg-panel">
        <summary className="cursor-pointer px-5 py-3 font-semibold">Details — cases per team, scoring, login capacity</summary>
        <ul className="space-y-1.5 border-t border-line p-5 text-sm text-muted">
          {caseList.map((c) => (
            <li key={c.code} className="flex justify-between">
              <span className="font-mono text-text">{c.code}</span>
              <span>
                {c.evidence[0]?.count ?? 0} questions · <b className="text-text">{byCase.get(c.code) ?? 0}</b> teams
              </span>
            </li>
          ))}
          {byCase.get("none") ? (
            <li className="flex justify-between text-danger">
              <span>no case</span>
              <span>{byCase.get("none")} teams</span>
            </li>
          ) : null}
          <li className="pt-2">
            Auto-scores:{" "}
            <b className="text-text">{autos.count ? `${autos.count} teams, last run ${new Date(autos.data![0].computed_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}` : "not run yet"}</b>
            {" · "}Shortlist: <b className="text-text">{shortlist.count ? `${shortlist.count} teams` : "not created"}</b>
          </li>
          <li>
            Logins: {plan.devices} devices ({realTeams || teams.length} teams × {cap.devicesPerTeam}), logins within {cap.loginWindowMinutes} min → need ≥{" "}
            <b className="text-text">{plan.recommendedPer5Min}</b> per 5 min{cap.configuredLimitPer5Min ? ` · configured ${cap.configuredLimitPer5Min}` : ""}
          </li>
        </ul>
      </details>
    </div>
  );
}
