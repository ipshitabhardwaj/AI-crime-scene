import Link from "next/link";
import AutoRefresh from "@/components/admin/AutoRefresh";
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
  const warnings = [
    n((t) => !t.case_code) && `${n((t) => !t.case_code)} team(s) have no case.`,
    n((t) => t.is_dummy) && `${n((t) => t.is_dummy)} dummy team(s) still exist (delete them before the event).`,
    (cases.data ?? []).some((c) => c.code.includes("SAMPLE")) && "The SAMPLE case is still loaded: delete it on the Cases page before importing real teams.",
    n((t) => !t.has_login) && `${n((t) => !t.has_login)} team(s) have no login.`,
  ].filter(Boolean) as string[];

  const stat = (label: string, value: string | number, note: string, href: string) => (
    <Link key={label} href={href} className="rounded-xl border border-line bg-panel p-4 hover:border-accent">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      <p className="text-xs text-muted">{note}</p>
    </Link>
  );

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={20} />
      <section className={`${ui.card} flex flex-wrap items-center gap-4`}>
        <div>
          <p className="text-sm text-muted">Current phase</p>
          <p className="text-2xl font-bold">{event ? phaseInfo(event.phase).label : "—"}</p>
          <p className="text-sm text-muted">
            {event?.phase_ends_at ? `ends ${new Date(event.phase_ends_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}` : "no timer"}
            {" · "}twist {event?.twist_released_at ? "released" : "not released"}
          </p>
        </div>
        <Link href="/admin/control" className={`${ui.btn} ml-auto`}>Open control room</Link>
      </section>

      {warnings.length > 0 && (
        <ul role="alert" className="list-disc space-y-1 rounded-lg border border-accent/50 bg-accent/10 p-3 pl-8 text-sm">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("Teams", teams.length, `${n((t) => t.checked_in)} checked in · ${n((t) => !!t.last_activity && now - new Date(t.last_activity).getTime() < 300_000)} active now`, "/admin/teams")}
        {stat("Initial reports", n((t) => t.initial_state === "submitted"), `submitted · ${n((t) => t.initial_state === "auto-locked")} auto-locked`, "/admin/control")}
        {stat("Final reports", n((t) => t.final_state === "submitted"), `submitted · ${n((t) => t.final_state === "auto-locked")} auto-locked`, "/admin/control")}
        {stat("Judging", `${scores.count ?? 0}`, `scores given · ${assignments.count ?? 0} assignments · ${judges.count ?? 0} judges`, "/admin/results")}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className={ui.card}>
          <h2 className="font-semibold">Case distribution</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {(cases.data ?? []).map((c) => (
              <li key={c.code} className="flex justify-between"><span className="font-mono">{c.code}</span><span className="text-muted">{c.evidence[0]?.count ?? 0} evidence · {byCase.get(c.code) ?? 0} teams</span></li>
            ))}
            {byCase.get("none") ? <li className="flex justify-between text-danger"><span>no case</span><span>{byCase.get("none")} teams</span></li> : null}
          </ul>
        </div>
        <div className={ui.card}>
          <h2 className="font-semibold">Scoring</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>Auto-scores: {autos.count ? `${autos.count} teams, last run ${new Date(autos.data![0].computed_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}` : "not run yet"}</li>
            <li>Shortlist: {shortlist.count ? `${shortlist.count} teams` : "not created"}</li>
          </ul>
        </div>
      </section>

      <section className={ui.card}>
        <h2 className="font-semibold">Event-day order</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li><Link className="text-text underline" href="/admin/cases">Cases</Link>: upload every case JSON, preview each, delete the SAMPLE case.</li>
          <li><Link className="text-text underline" href="/admin/teams">Teams</Link>: import the registration CSV, delete dummy teams, print credential slips.</li>
          <li>Check teams in at the desk (Teams page) as they arrive.</li>
          <li><Link className="text-text underline" href="/admin/control">Control room</Link>: run the phases. Open the projector page on the big screen.</li>
          <li><Link className="text-text underline" href="/admin/results">Results</Link>: auto-score, assign judges, shortlist, reveal.</li>
        </ol>
      </section>
    </div>
  );
}
