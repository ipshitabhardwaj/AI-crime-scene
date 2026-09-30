import Link from "next/link";
import AutoRefresh from "@/components/admin/AutoRefresh";
import LiveClock from "@/components/admin/LiveClock";
import { PageHeader } from "@/components/ui";
import { extendDeadline, resetEvent, setPhase, setTimer } from "@/app/actions/admin";
import { PHASES, phaseInfo, type EventPhase } from "@/lib/constants";
import { getEvent } from "@/lib/event";
import { WRITING_PHASES, transitionsFrom } from "@/lib/state-machine";
import { getTeamStatus } from "@/lib/status";
import { nowMs } from "@/lib/time";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

const STEPS: { phase: EventPhase; title: string; detail: string; minutes?: number }[] = [
  { phase: "investigation", title: "1 · Start investigation", detail: "Opens every team's case. Teams read and tag evidence, build a timeline and submit an Initial Conclusion.", minutes: 75 },
  { phase: "initial_locked", title: "2 · Lock initial stage", detail: "Ends round 1. Locks every team's Initial Conclusion, tags and timeline (unsubmitted drafts are locked as they are)." },
  { phase: "twist", title: "3 · Release the twist", detail: "Shows the new evidence to every team. Teams can update their timeline and write the final report.", minutes: 20 },
  { phase: "final", title: "4 · Final report (optional)", detail: "Same as the twist phase with a new timer. You can skip it and go straight to Close.", minutes: 20 },
  { phase: "closed", title: "5 · Close submissions", detail: "Ends the investigation. Locks every final report. Then go to Results." },
  { phase: "presentations", title: "6 · Presentations", detail: "The projector shows the shortlisted teams in order. (Create the shortlist on Results first.)" },
  { phase: "results", title: "7 · Reveal results", detail: "The projector reveals the top 10. Judges can no longer change scores." },
];
const stepOf = (p: EventPhase) => STEPS.find((s) => s.phase === p)!;

/** What organisers should be doing while the current phase runs. */
const DURING: Record<EventPhase, string> = {
  waiting: "Check teams in at the desk. When everyone is seated and logged in, start the investigation.",
  investigation: "Teams are investigating. Watch Live status for teams that need help. When the timer ends, lock the initial stage.",
  initial_locked: "Round 1 is locked. Announce the twist, then release it.",
  twist: "Teams are reviewing the new evidence and writing final reports. When time is up, close submissions.",
  final: "Teams are finishing their final reports. When time is up, close submissions.",
  closed: "Submissions are closed. Go to Results: auto-score, assign judges, then shortlist.",
  presentations: "Shortlisted teams are presenting. Judges enter presentation scores. Then reveal the results.",
  results: "Results are on the projector. Export the CSV from Results and keep it safe.",
};

export default async function ControlPage() {
  const event = await getEvent();
  const teams = await getTeamStatus();
  const phase = (event?.phase ?? "waiting") as EventPhase;
  const current = PHASES.findIndex((p) => p.id === phase);
  const noCase = teams.filter((t) => !t.case_code).length;
  const now = nowMs();
  const writing = WRITING_PHASES.includes(phase);
  const attention = teams.filter(
    (t) => !t.has_login || !t.case_code || (writing && (!t.last_activity || now - new Date(t.last_activity).getTime() > 10 * 60_000)),
  ).length;

  const forward = transitionsFrom(phase).filter((t) => !t.back);
  const back = transitionsFrom(phase).find((t) => t.back);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={15} />
      <PageHeader kicker="Run the event" title="Control room" description="One step at a time. The yellow box always shows the only next step you can take." />

      <section className="rounded-2xl border border-line bg-panel p-6" aria-label="Now">
        <div className="flex flex-wrap items-start gap-6">
          <LiveClock initial={event} />
          <div className="min-w-60 flex-1 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {current > 0 ? `Step ${current} of 7` : "Not started"} · what to do now
            </p>
            <p className="text-base">{DURING[phase]}</p>
            <Link href="/admin/status" className={`inline-flex items-center gap-2 text-sm ${attention ? "text-danger" : "text-muted"} underline`}>
              {attention ? `${attention} team(s) need attention` : "All teams OK"} → Live status
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border-2 border-accent/70 bg-accent/5 p-6" aria-label="Next step">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Next step</p>
        {noCase > 0 && phase === "waiting" && (
          <p role="alert" className="rounded-md border border-danger/50 bg-danger/10 p-2 text-sm">
            {noCase} team(s) have no case and will see nothing. Fix it on <Link className="underline" href="/admin/teams">Teams → Rebalance cases</Link>.
          </p>
        )}
        {forward.length === 0 && (
          <div className="space-y-2">
            <p className="text-2xl font-bold">The event is complete 🎉</p>
            <p className="text-sm text-muted">Export the results CSV and keep it safe before any reset.</p>
            <Link href="/admin/results" className={ui.btnLg}>Go to Results →</Link>
          </div>
        )}
        {forward.map((t, i) => {
          const s = stepOf(t.to);
          const tick = t.confirm || (t.to === "investigation" && noCase > 0);
          return (
            <form key={t.to} action={setPhase} className={`space-y-4 ${i > 0 ? "border-t border-line pt-4 opacity-90" : ""}`}>
              <input type="hidden" name="phase" value={s.phase} />
              {i > 0 && <p className="text-xs text-muted">Or:</p>}
              <div>
                <p className={i === 0 ? "text-2xl font-bold" : "text-lg font-semibold"}>{s.title}</p>
                <p className="mt-1 text-muted">{s.detail}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {s.minutes !== undefined && (
                  <label className="flex items-center gap-2 text-sm">
                    Timer
                    <input name="minutes" type="number" min={0} max={600} defaultValue={s.minutes} className={`${ui.input} w-20`} /> minutes
                  </label>
                )}
                {tick && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="confirm" className="h-5 w-5 accent-[var(--color-accent)]" /> I’m sure
                  </label>
                )}
                <button className={`${i === 0 ? "px-10 py-3 text-lg" : "px-6 py-2"} ml-auto rounded-lg bg-accent font-bold text-ink hover:brightness-110`}>Go</button>
              </div>
            </form>
          );
        })}
      </section>

      <details className="rounded-xl border border-line bg-panel">
        <summary className="cursor-pointer px-5 py-3 font-semibold">More options — timer, go back, reset</summary>
        <div className="space-y-6 border-t border-line p-5">
          <div className="space-y-2">
            <p className="font-semibold">Timer</p>
            <form action={setTimer} className="flex flex-wrap items-center gap-2">
              <input name="minutes" type="number" min={0} max={600} defaultValue={0} aria-label="Minutes from now" className={`${ui.input} w-20`} />
              <button className={ui.btnGhost}>Change timer (min from now, 0 = none)</button>
            </form>
            <form action={extendDeadline} className="flex flex-wrap items-center gap-2">
              <input name="minutes" type="number" min={-120} max={120} defaultValue={5} aria-label="Minutes to add" className={`${ui.input} w-20`} />
              <button className={ui.btnGhost}>Extend deadline for everyone</button>
            </form>
            <p className="text-xs text-muted">Extra time for one team only: Live status → “this phase +5”.</p>
          </div>

          {back && (
            <div className="space-y-2">
              <p className="font-semibold">Go back one step</p>
              <p className="text-xs text-muted">Only if you pressed Go by mistake. Going back never unlocks locked work.</p>
              <form action={setPhase} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                <input type="hidden" name="phase" value={back.to} />
                <span className="min-w-60 flex-1 text-sm">
                  Back to <b>{stepOf(back.to)?.title ?? "1 · Waiting (before the start)"}</b>
                </span>
                <input name="override" placeholder="type BACK" aria-label="Type BACK to go back" className={`${ui.input} w-28 py-1`} />
                <button className={ui.btnGhost}>Go back</button>
              </form>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-danger/40 p-4">
            <p className="font-semibold text-danger">Danger zone · Reset event (dry runs only)</p>
            <p className="text-sm text-muted">
              Deletes all team work, scores, judge assignments and the shortlist, removes all extra time, and returns to Waiting. <b>Keeps</b> teams, PINs, check-ins,
              cases, judges and admins. Export results first.
              {phase !== "waiting" && <b className="text-danger"> The event is currently in “{phaseInfo(phase).label}”.</b>}
            </p>
            <form action={resetEvent} className="flex gap-2">
              <input name="confirm" placeholder="type RESET" aria-label="Type RESET to confirm" className={`${ui.input} w-32`} />
              <button className={ui.btnDanger}>Reset event</button>
            </form>
          </div>

          <div className="space-y-1">
            <p className="font-semibold">All steps</p>
            <ol className="space-y-1 text-sm">
              {STEPS.map((s, i) => (
                <li key={s.phase} className={i + 1 === current ? "font-semibold text-accent" : i + 1 < current ? "text-muted line-through" : "text-muted"}>
                  {s.title}
                  {i + 1 === current ? " ← now" : ""}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </details>
    </div>
  );
}
