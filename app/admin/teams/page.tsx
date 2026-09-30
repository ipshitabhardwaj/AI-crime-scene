import Link from "next/link";
import ImportTeams from "@/components/admin/ImportTeams";
import { addTeam, deleteAllTeams, deleteDummyTeams, deleteTeam, rebalanceCases, resetPin, setCheckedIn, setTeamCase } from "@/app/actions/admin-teams";
import { getEvent } from "@/lib/event";
import { createClient } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  team_code: string;
  name: string;
  institution: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  members: { name: string }[];
  case_id: string | null;
  checked_in: boolean;
  is_dummy: boolean;
  team_credentials: { pin: string } | null;
};

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const supabase = await createClient();
  const [{ data: teams }, { data: cases }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, team_code, name, institution, contact_email, contact_phone, members, case_id, checked_in, is_dummy, team_credentials(pin)")
      .order("team_code")
      .returns<Row[]>(),
    supabase.from("cases").select("id, code").order("code"),
  ]);
  const all = teams ?? [];
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? all.filter((t) => [t.team_code, t.name, t.institution, t.contact_email, ...t.members.map((m) => m.name)].some((v) => v?.toLowerCase().includes(needle)))
    : all;
  const dummyCount = all.filter((t) => t.is_dummy).length;
  const noCase = all.filter((t) => !t.case_id).length;
  const event = await getEvent();
  const waiting = !event || event.phase === "waiting";

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Registration & check-in"
        title="Teams"
        description="Import teams, check them in at the desk, reset PINs and print credential slips."
        actions={<Link href="/admin/teams/slips" className={ui.btnGhost}>Credential slips</Link>}
      />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Teams" value={all.length} note={`${all.length - dummyCount} real · ${dummyCount} dummy`} />
        <Stat label="Checked in" value={`${all.filter((t) => t.checked_in).length}/${all.length}`} tone={all.length && all.every((t) => t.checked_in) ? "ok" : undefined} />
        <Stat label="Without case" value={noCase} tone={noCase ? "danger" : "ok"} />
        <Stat label="Members" value={all.reduce((n, t) => n + t.members.length, 0)} note="registered participants" />
      </section>

      <section className={ui.card}>
        <h2 className="mb-1 font-semibold">1 · Import from registration form</h2>
        <p className="mb-4 text-sm text-muted">Creates a team code (AIF-001…), a 6-digit PIN and a login for each row, and assigns cases round-robin.</p>
        <ImportTeams />
      </section>

      <section className={ui.card}>
        <details>
          <summary className="cursor-pointer font-semibold">2 · Add one team manually (spot registration)</summary>
          <form action={addTeam} className="mt-4 grid gap-3 md:grid-cols-2">
            <input name="name" required placeholder="Team name *" className={ui.input} />
            <input name="institution" placeholder="College" className={ui.input} />
            <input name="email" type="email" placeholder="Leader email" className={ui.input} />
            <input name="phone" placeholder="Leader phone" className={ui.input} />
            <input name="members" placeholder="Member names, comma separated" className={`${ui.input} md:col-span-2`} />
            <button className={`${ui.btn} w-fit`}>Create team</button>
          </form>
        </details>
      </section>

      {noCase > 0 && (
        <p role="alert" className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">
          {noCase} team(s) have no case. {waiting ? "Click “Rebalance cases”." : "Set their case in the table below."}
        </p>
      )}
      {!waiting && (
        <p className="rounded-lg border border-line p-3 text-xs text-muted">
          The event is running: rebalancing is disabled, and a team’s case can only be changed if the team has not started work.
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">3 · Check-in and team list ({shown.length}{needle ? ` of ${all.length}` : ""})</h2>
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search name, code, college, member…" className={`${ui.input} w-72`} />
            <button className={ui.btnGhost}>Search</button>
          </form>
          <div className="ml-auto flex flex-wrap gap-2">
            {waiting && (
              <form action={rebalanceCases}>
                <button className={ui.btnGhost} title="Re-assign every team's case round-robin by team code">Rebalance cases</button>
              </form>
            )}
            {dummyCount > 0 && (
              <form action={deleteDummyTeams} className="flex gap-1">
                <input name="confirm" placeholder="type DELETE" aria-label="Type DELETE to confirm" className={`${ui.input} w-28 py-1`} />
                <button className={ui.btnDanger}>Delete {dummyCount} dummy teams</button>
              </form>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead className="text-muted">
              <tr>
                <th className={ui.th}>Code</th><th className={ui.th}>Team</th><th className={ui.th}>Members</th>
                <th className={ui.th}>Case</th><th className={ui.th}>PIN</th><th className={ui.th}>Check-in</th><th className={ui.th}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} className={`border-t border-line align-top ${t.checked_in ? "" : "bg-ink/40"}`}>
                  <td className={`${ui.td} font-mono`}>{t.team_code}</td>
                  <td className={ui.td}>
                    <div className="font-medium">{t.name}{t.is_dummy && <span className="ml-2 text-xs text-muted">(dummy)</span>}</div>
                    <div className="text-xs text-muted">{[t.institution, t.contact_email, t.contact_phone].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className={`${ui.td} text-xs text-muted`}>{t.members.map((m) => m.name).join(", ")}</td>
                  <td className={ui.td}>
                    <form action={setTeamCase} className="flex gap-1">
                      <input type="hidden" name="teamId" value={t.id} />
                      <select name="caseId" defaultValue={t.case_id ?? ""} className={`${ui.input} py-1`}>
                        <option value="">—</option>
                        {(cases ?? []).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                      </select>
                      <button className="text-xs text-muted hover:text-text">Set</button>
                    </form>
                  </td>
                  <td className={`${ui.td} font-mono`}>{t.team_credentials?.pin ?? "—"}</td>
                  <td className={ui.td}>
                    <form action={setCheckedIn}>
                      <input type="hidden" name="teamId" value={t.id} />
                      <input type="hidden" name="value" value={String(!t.checked_in)} />
                      <input type="hidden" name="back" value={needle ? `/admin/teams?q=${encodeURIComponent(q)}` : "/admin/teams"} />
                      <button className={t.checked_in ? "rounded-md bg-ok/20 px-3 py-1 text-xs text-ok" : ui.btnGhost}>
                        {t.checked_in ? "✓ Checked in" : "Check in"}
                      </button>
                    </form>
                  </td>
                  <td className={ui.td}>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted">More</summary>
                      <div className="mt-2 space-y-2">
                        <form action={resetPin}>
                          <input type="hidden" name="teamId" value={t.id} />
                          <button className={ui.btnGhost}>Reset PIN</button>
                        </form>
                        <form action={deleteTeam} className="flex gap-1">
                          <input type="hidden" name="teamId" value={t.id} />
                          <input name="confirm" placeholder="DELETE" aria-label="Type DELETE to confirm" className={`${ui.input} w-20 py-1`} />
                          <button className={ui.btnDanger}>Delete</button>
                        </form>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">No teams{needle ? " match" : " yet"}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {waiting && (
        <section className="rounded-xl border border-danger/40 p-5">
          <h2 className="font-semibold text-danger">Delete ALL teams</h2>
          <p className="mt-1 text-sm text-muted">After a dry run with test teams: deletes every team, its login, PIN and work. Cases, judges and admins stay. Only possible in Waiting.</p>
          <form action={deleteAllTeams} className="mt-3 flex flex-wrap gap-2">
            <input name="confirm" placeholder="type DELETE ALL TEAMS" aria-label="Type DELETE ALL TEAMS to confirm" className={`${ui.input} w-56`} />
            <button className={ui.btnDanger}>Delete all teams</button>
          </form>
        </section>
      )}
    </div>
  );
}
