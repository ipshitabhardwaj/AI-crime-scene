import Link from "next/link";
import AutoRefresh from "@/components/admin/AutoRefresh";
import { PageHeader, Pill } from "@/components/ui";
import { addTeamMinutes, unlockSubmission } from "@/app/actions/admin";
import type { EventPhase } from "@/lib/constants";
import { getEvent } from "@/lib/event";
import { WRITING_PHASES } from "@/lib/state-machine";
import { getTeamStatus, type TeamStatus } from "@/lib/status";
import { nowMs } from "@/lib/time";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

const since = (iso: string | null) => {
  if (!iso) return "—";
  const m = Math.round((nowMs() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : `${m} min ago`;
};

export default async function StatusPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const event = await getEvent();
  const teams = await getTeamStatus();
  const phase = (event?.phase ?? "waiting") as EventPhase;
  const now = nowMs();
  const writing = WRITING_PHASES.includes(phase);
  const count = (f: (t: TeamStatus) => boolean) => teams.filter(f).length;
  const needsAttention = (t: TeamStatus) =>
    !t.has_login || !t.case_code || (writing && (!t.last_activity || now - new Date(t.last_activity).getTime() > 10 * 60_000));
  const attention = teams.filter(needsAttention);
  const shownTeams = view === "attention" ? attention : teams;
  const stateCls = (s: string | null) => (s === "submitted" ? "ok" : s === "auto-locked" ? "accent" : "neutral") as "ok" | "accent" | "neutral";
  const tabCls = (on: boolean) => `rounded-md px-3 py-1.5 text-sm ${on ? "bg-panel2 text-text ring-1 ring-line" : "text-muted hover:text-text"}`;

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={15} />
      <PageHeader
        kicker="During the event"
        title="Live status"
        description="Every team at a glance. Red rows need someone to walk over. Give extra time to one team here."
      />
      <p className="text-sm text-muted">
        {count((t) => !!t.last_activity && now - new Date(t.last_activity).getTime() < 5 * 60_000)} of {teams.length} teams active in the last 5 min ·{" "}
        {count((t) => t.initial_state === "submitted")} Initial Conclusions submitted · {count((t) => t.final_state === "submitted")} final reports submitted
      </p>
      <section className={ui.cardTight} aria-label="Team status">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <h2 className="font-semibold">Team status</h2>
          <nav className="flex gap-1">
            <Link href="/admin/status" className={tabCls(view !== "attention")}>All {teams.length}</Link>
            <Link href="/admin/status?view=attention" className={tabCls(view === "attention")}>
              Needs attention <span className={attention.length ? "text-danger" : ""}>{attention.length}</span>
            </Link>
          </nav>
          <span className="ml-auto text-xs text-muted">Updates every 15 s</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted">
              <tr>
                <th className={ui.th}>Team</th>
                <th className={ui.th}>Case</th>
                <th className={ui.th}>Tags</th>
                <th className={ui.th}>Timeline</th>
                <th className={ui.th}>Initial</th>
                <th className={ui.th}>Final</th>
                <th className={ui.th}>Last activity</th>
                <th className={ui.th}>Extra time</th>
              </tr>
            </thead>
            <tbody>
              {shownTeams.map((t) => (
                <tr key={t.team_id} className={`border-t border-line ${needsAttention(t) ? "bg-danger/5" : ""}`}>
                  <td className={ui.td}>
                    <span className="font-mono text-accent">{t.team_code}</span> {t.name}
                    <span className="ml-1 inline-flex gap-1 align-middle">
                      {!t.checked_in && <Pill>not checked in</Pill>}
                      {!t.has_login && <Pill tone="danger">no login</Pill>}
                    </span>
                  </td>
                  <td className={`${ui.td} font-mono ${t.case_code ? "text-muted" : "text-danger"}`}>{t.case_code ?? "none"}</td>
                  <td className={`${ui.td} tabular-nums`}>{t.tags}</td>
                  <td className={`${ui.td} tabular-nums text-muted`} title="initial / final steps">
                    {t.tl_initial} / {t.tl_final}
                  </td>
                  <td className={ui.td}>
                    {t.initial_state ? <Pill tone={stateCls(t.initial_state)}>{t.initial_state}</Pill> : <span className="text-muted">—</span>}
                    {t.initial_state === "submitted" && <Unlock teamId={t.team_id} stage="initial" />}
                  </td>
                  <td className={ui.td}>
                    {t.final_state ? <Pill tone={stateCls(t.final_state)}>{t.final_state}</Pill> : <span className="text-muted">—</span>}
                    {t.final_state === "submitted" && <Unlock teamId={t.team_id} stage="final" />}
                  </td>
                  <td className={`${ui.td} text-muted`}>{since(t.last_activity)}</td>
                  <td className={ui.td}>
                    <div className="flex flex-col gap-1">
                      <form action={addTeamMinutes} className="flex items-center gap-1">
                        <input type="hidden" name="teamId" value={t.team_id} />
                        <input type="hidden" name="scope" value="phase" />
                        <span className="w-24 text-xs" title="Extra minutes for the phase running now only">this phase <b className="font-mono">+{t.phase_extra_minutes}</b></span>
                        <button name="minutes" value="5" disabled={!writing} aria-label={`Give ${t.team_code} 5 more minutes in this phase`} className="rounded border border-line px-2 text-xs hover:border-accent disabled:opacity-40">+5</button>
                        <button name="minutes" value="-5" disabled={!writing} aria-label={`Take 5 minutes from ${t.team_code} in this phase`} className="rounded border border-line px-2 text-xs hover:border-accent disabled:opacity-40">−5</button>
                      </form>
                      <form action={addTeamMinutes} className="flex items-center gap-1">
                        <input type="hidden" name="teamId" value={t.team_id} />
                        <input type="hidden" name="scope" value="event" />
                        <span className="w-24 text-xs text-muted" title="Extra minutes on every remaining deadline">whole event <b className="font-mono">+{t.extra_minutes}</b></span>
                        <button name="minutes" value="5" aria-label={`Give ${t.team_code} 5 more minutes for the whole event`} className="rounded border border-line px-2 text-xs text-muted hover:border-accent">+5</button>
                        <button name="minutes" value="-5" aria-label={`Take 5 minutes from ${t.team_code} for the whole event`} className="rounded border border-line px-2 text-xs text-muted hover:border-accent">−5</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {shownTeams.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted">
                    {view === "attention" ? "No team needs attention right now. ✓" : "No teams yet — import them on the Teams page."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Red rows need attention: no login, no case, or no activity for 10 min while teams are writing. “auto-locked” = time ran out before the team pressed Submit; the
          draft is still scored. Extra time: <b>this phase</b> (default) ends with the current phase; <b>whole event</b> is added to every remaining deadline.
        </p>
      </section>

    </div>
  );
}

function Unlock({ teamId, stage }: { teamId: string; stage: string }) {
  return (
    <form action={unlockSubmission} className="inline">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="stage" value={stage} />
      <button className="ml-1 text-xs text-muted underline hover:text-text" title="Let this team edit again (only while its phase is running)">
        unlock
      </button>
    </form>
  );
}
