import AutoRefresh from "@/components/admin/AutoRefresh";
import LiveClock from "@/components/admin/LiveClock";
import { addTeamMinutes, extendDeadline, resetEvent, setPhase, setTimer, unlockSubmission } from "@/app/actions/admin";
import { PHASES, phaseInfo, type EventPhase } from "@/lib/constants";
import { getEvent } from "@/lib/event";
import { getTeamStatus } from "@/lib/status";
import { nowMs } from "@/lib/time";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

const STEPS: { phase: EventPhase; title: string; detail: string; minutes?: number; confirm?: boolean }[] = [
  { phase: "investigation", title: "1 · Start investigation", detail: "Opens every case file. Teams tag evidence, build a timeline and submit an initial conclusion.", minutes: 75 },
  { phase: "initial_locked", title: "2 · Lock initial answers", detail: "Locks every initial report. Unsubmitted drafts are locked as they are (“auto-locked”).", confirm: true },
  { phase: "twist", title: "3 · Release the twist", detail: "Reveals twist evidence to every team. Teams get an editable copy of their timeline and report.", minutes: 20, confirm: true },
  { phase: "final", title: "4 · Final report", detail: "Teams finish the final case report.", minutes: 20 },
  { phase: "closed", title: "5 · Close submissions", detail: "Locks every final report. Then go to Results.", confirm: true },
  { phase: "presentations", title: "6 · Presentations", detail: "Projector shows the shortlist order." },
  { phase: "results", title: "7 · Reveal results", detail: "Projector reveals the top 10. Needs auto-scores.", confirm: true },
];

const since = (iso: string | null) => {
  if (!iso) return "—";
  const m = Math.round((nowMs() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : `${m} min ago`;
};

export default async function ControlPage() {
  const event = await getEvent();
  const teams = await getTeamStatus();
  const current = PHASES.findIndex((p) => p.id === event?.phase);
  const noCase = teams.filter((t) => !t.case_code).length;
  const real = teams.filter((t) => !t.is_dummy);
  const count = (f: (t: (typeof teams)[number]) => boolean) => teams.filter(f).length;
  const now = nowMs();
  const activeRecently = count((t) => !!t.last_activity && now - new Date(t.last_activity).getTime() < 5 * 60_000);

  const stateCls = (s: string | null) => (s === "submitted" ? "text-ok" : s === "auto-locked" ? "text-accent" : "text-muted");

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={15} />
      <section className={`${ui.card} flex flex-wrap items-start gap-6`}>
        <LiveClock initial={event} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">Teams</dt><dd className="font-semibold">{teams.length} <span className="text-xs text-muted">({real.length} real)</span></dd></div>
          <div><dt className="text-muted">Active (5 min)</dt><dd className="font-semibold">{activeRecently}</dd></div>
          <div><dt className="text-muted">Twist</dt><dd className="font-semibold">{event?.twist_released_at ? `released ${since(event.twist_released_at)}` : "not released"}</dd></div>
          <div><dt className="text-muted">Initial submitted</dt><dd className="font-semibold">{count((t) => t.initial_state === "submitted")} / {teams.length}</dd></div>
          <div><dt className="text-muted">Final submitted</dt><dd className="font-semibold">{count((t) => t.final_state === "submitted")} / {teams.length}</dd></div>
          <div><dt className="text-muted">No case</dt><dd className={`font-semibold ${noCase ? "text-danger" : ""}`}>{noCase}</dd></div>
        </dl>
        <div className="ml-auto space-y-2">
          <form action={setTimer} className="flex items-center gap-2">
            <input name="minutes" type="number" min={0} max={600} defaultValue={0} aria-label="Minutes from now" className={`${ui.input} w-20`} />
            <button className={ui.btnGhost}>Change timer (min from now, 0 = none)</button>
          </form>
          <form action={extendDeadline} className="flex items-center gap-2">
            <input name="minutes" type="number" min={-120} max={120} defaultValue={5} aria-label="Minutes to add" className={`${ui.input} w-20`} />
            <button className={ui.btnGhost}>Extend deadline for everyone</button>
          </form>
        </div>
      </section>

      {noCase > 0 && (
        <p role="alert" className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">
          {noCase} team(s) have no case and will see nothing. Fix it on Teams → Rebalance cases (only before the start) or set their case individually.
        </p>
      )}

      <section className="space-y-2" aria-label="Event steps">
        {STEPS.map((s) => {
          const i = PHASES.findIndex((p) => p.id === s.phase);
          const isCurrent = i === current;
          const isPast = i < current;
          return (
            <form
              key={s.phase}
              action={setPhase}
              className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 ${isCurrent ? "border-accent bg-accent/5" : "border-line"} ${isPast ? "opacity-60" : ""}`}
            >
              <input type="hidden" name="phase" value={s.phase} />
              <div className="min-w-64 flex-1">
                <p className="font-semibold">
                  {s.title} {isCurrent && <span className="ml-2 text-xs text-accent">NOW</span>} {isPast && <span className="ml-2 text-xs text-muted">done</span>}
                </p>
                <p className="text-sm text-muted">{s.detail}</p>
              </div>
              {isCurrent ? (
                <span className="text-sm text-muted">Current phase. Use “Change timer” above to adjust time.</span>
              ) : isPast ? (
                <>
                  <input name="override" placeholder="type BACK" aria-label="Type BACK to go back" className={`${ui.input} w-28 py-1`} />
                  <button className={ui.btnGhost}>Go back</button>
                </>
              ) : (
                <>
                  {s.minutes !== undefined && (
                    <label className="flex items-center gap-2 text-sm text-muted">
                      Timer
                      <input name="minutes" type="number" min={0} max={600} defaultValue={s.minutes} className={`${ui.input} w-20`} /> min
                    </label>
                  )}
                  {(s.confirm || i - current > 1 || (s.phase === "investigation" && noCase > 0)) && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="confirm" /> I’m sure
                    </label>
                  )}
                  <button className={ui.btn}>Go</button>
                </>
              )}
            </form>
          );
        })}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Team status</h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-panel text-muted">
              <tr>
                <th className={ui.th}>Team</th><th className={ui.th}>Case</th><th className={ui.th}>Tags</th><th className={ui.th}>Timeline (init/final)</th>
                <th className={ui.th}>Initial</th><th className={ui.th}>Final</th><th className={ui.th}>Last activity</th><th className={ui.th}>Extra time</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.team_id} className="border-t border-line">
                  <td className={ui.td}>
                    <span className="font-mono text-accent">{t.team_code}</span> {t.name}
                    {!t.checked_in && <span className="ml-1 text-xs text-muted">(not checked in)</span>}
                    {!t.has_login && <span className="ml-1 text-xs text-danger">(no login)</span>}
                  </td>
                  <td className={`${ui.td} font-mono ${t.case_code ? "text-muted" : "text-danger"}`}>{t.case_code ?? "none"}</td>
                  <td className={ui.td}>{t.tags}</td>
                  <td className={ui.td}>{t.tl_initial} / {t.tl_final}</td>
                  <td className={`${ui.td} ${stateCls(t.initial_state)}`}>
                    {t.initial_state ?? "—"} {t.initial_state === "submitted" && <Unlock teamId={t.team_id} stage="initial" />}
                  </td>
                  <td className={`${ui.td} ${stateCls(t.final_state)}`}>
                    {t.final_state ?? "—"} {t.final_state === "submitted" && <Unlock teamId={t.team_id} stage="final" />}
                  </td>
                  <td className={`${ui.td} text-muted`}>{since(t.last_activity)}</td>
                  <td className={ui.td}>
                    <form action={addTeamMinutes} className="flex items-center gap-1">
                      <input type="hidden" name="teamId" value={t.team_id} />
                      <span className="w-10 font-mono">{t.extra_minutes ? `+${t.extra_minutes}` : "0"}</span>
                      <button name="minutes" value="5" aria-label={`Give ${t.team_code} 5 more minutes`} className="rounded border border-line px-2 text-xs hover:border-accent">+5</button>
                      <button name="minutes" value="-5" aria-label={`Take 5 minutes from ${t.team_code}`} className="rounded border border-line px-2 text-xs hover:border-accent">−5</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Updates every 15 s. “auto-locked” = time ran out before the team pressed Submit; the draft is still scored.</p>
      </section>

      <section className="rounded-xl border border-danger/40 p-5">
        <h2 className="font-semibold text-danger">Reset event (dry runs only)</h2>
        <p className="mt-2 text-sm text-muted">
          Deletes all tags, timelines, reports, auto-scores, judge scores, judge assignments and the shortlist, removes extra time, and
          returns to Waiting. <b>Keeps</b> teams, logins/PINs, check-ins, cases and answer keys, judges and admins.
          {event && event.phase !== "waiting" && <b className="text-danger"> The event is currently in “{phaseInfo(event.phase).label}”.</b>}
        </p>
        <form action={resetEvent} className="mt-3 flex gap-2">
          <input name="confirm" placeholder="type RESET" aria-label="Type RESET to confirm" className={`${ui.input} w-32`} />
          <button className={ui.btnDanger}>Reset event</button>
        </form>
      </section>
    </div>
  );
}

function Unlock({ teamId, stage }: { teamId: string; stage: string }) {
  return (
    <form action={unlockSubmission} className="inline">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="stage" value={stage} />
      <button className="ml-1 text-xs text-muted underline hover:text-text" title="Let this team edit again (only while its phase is running)">unlock</button>
    </form>
  );
}
