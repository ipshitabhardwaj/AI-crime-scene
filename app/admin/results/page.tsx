import { assignJudges, createShortlist, runAutoScoring } from "@/app/actions/admin-results";
import { getEvent } from "@/lib/event";
import { getLeaderboard } from "@/lib/results";
import { createAdminClient } from "@/lib/supabase/admin";
import { ui } from "@/lib/ui";
import { PageHeader, Pill } from "@/components/ui";
import { JUDGING_ADMIN_PHASES } from "@/lib/state-machine";
import type { EventPhase } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  // Layout already required the admin role; the leaderboard needs every team's scores.
  const board = await getLeaderboard(createAdminClient());
  const scored = board.filter((r) => r.auto).length;
  const shortlisted = board.filter((r) => r.shortlist).length;
  const event = await getEvent();
  const closed = ["closed", "presentations", "results"].includes(event?.phase ?? "");
  const judgedTeams = board.filter((r) => r.judgesAssigned > 0);
  const fullyJudged = judgedTeams.filter((r) => r.judgeCount >= r.judgesAssigned).length;
  const judgingOpen = JUDGING_ADMIN_PHASES.includes((event?.phase ?? "waiting") as EventPhase);
  const status = (done: boolean, available: boolean) =>
    done ? <Pill tone="ok">done</Pill> : available ? <Pill tone="accent">next</Pill> : <Pill>after Close</Pill>;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Scoring & judging"
        title="Results"
        description="After Close: 1 auto-score → 2 assign judges → 3 shortlist (when judging is complete) → then Presentations and Reveal in the Control room."
        actions={<a href="/admin/export" className={ui.btnGhost}>Export CSV</a>}
      />
      <section className="grid gap-4 md:grid-cols-3">
        <div className={ui.card}>
          <h2 className="flex items-center justify-between font-semibold">1 · Auto-score {status(scored > 0, true)}</h2>
          <p className="mt-1 text-sm text-muted">Questions 24 · twist questions 12 · Initial Conclusion 6 · Final Report 8 (50 pts). Re-run any time.</p>
          <form action={runAutoScoring} className="mt-3 space-y-2 text-sm">
            {!closed && (
              <label className="flex items-center gap-2 text-muted"><input type="checkbox" name="confirm" /> score anyway (submissions still open)</label>
            )}
            <button className={ui.btn}>Run auto-scoring</button>
          </form>
          <p className="mt-2 text-xs text-muted">{scored} of {board.length} teams scored. Safe to re-run; it recomputes from the answer keys.</p>
        </div>
        <div className={ui.card}>
          <h2 className="flex items-center justify-between font-semibold">2 · Assign judges {status(judgedTeams.length > 0, judgingOpen && scored > 0)}</h2>
          <p className="mt-1 text-sm text-muted">Top teams go to judges for the reasoning scores. Available once submissions are closed.</p>
          <form action={assignJudges} className="mt-3 space-y-2 text-sm">
            <label className="flex items-center gap-2">Top <input name="topN" type="number" defaultValue={20} className={`${ui.input} w-20`} /> teams</label>
            <label className="flex items-center gap-2"><input name="perTeam" type="number" defaultValue={2} className={`${ui.input} w-20`} /> judges per team</label>
            <label className="flex items-center gap-2 text-muted"><input name="includeDummy" type="checkbox" /> include dummy teams</label>
            <button className={ui.btn}>Assign</button>
          </form>
        </div>
        <div className={ui.card}>
          <h2 className="flex items-center justify-between font-semibold">3 · Shortlist {status(shortlisted > 0, judgingOpen && judgedTeams.length > 0)}</h2>
          <p className="mt-1 text-sm text-muted">After judging is complete: top teams by total present; every judge can then score their presentation.</p>
          <form action={createShortlist} className="mt-3 space-y-2 text-sm">
            <label className="flex items-center gap-2">Top <input name="size" type="number" defaultValue={10} className={`${ui.input} w-20`} /> teams</label>
            <label className="flex items-center gap-2 text-muted"><input name="includeDummy" type="checkbox" /> include dummy teams</label>
            {judgedTeams.length > fullyJudged && (
              <label className="flex items-center gap-2 text-accent"><input name="incomplete" type="checkbox" /> shortlist anyway ({judgedTeams.length - fullyJudged} teams not fully judged)</label>
            )}
            {shortlisted > 0 && <label className="flex items-center gap-2 text-accent"><input name="confirm" type="checkbox" /> replace the existing shortlist</label>}
            <button className={ui.btn}>Create shortlist</button>
          </form>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-3">
          <h2 className="font-semibold">Leaderboard</h2>
          <span className="text-sm text-muted">Judging: {fullyJudged}/{judgedTeams.length} assigned teams fully scored · shortlist: {shortlisted || "none"}</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead className="text-muted">
              <tr>
                <th className={ui.th}>#</th><th className={ui.th}>Team</th><th className={ui.th}>Case</th>
                <th className={ui.th} title="Round-1 questions /24">Q</th><th className={ui.th} title="Twist questions /12">Twist</th>
                <th className={ui.th} title="Initial Conclusion named the culprit /6">IC</th><th className={ui.th} title="Final Report named the culprit /8">Final</th>
                <th className={ui.th}>Auto /50</th><th className={ui.th}>Judges /50</th><th className={ui.th}>Judged</th>
                <th className={ui.th}>Total</th><th className={ui.th}>Shortlist</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.id} className={`border-t border-line ${r.shortlist ? "bg-accent/5" : ""}`}>
                  <td className={ui.td}>{r.rank}</td>
                  <td className={ui.td}><span className="font-mono text-accent">{r.team_code}</span> {r.name}{r.is_dummy && <span className="text-xs text-muted"> (dummy)</span>}</td>
                  <td className={`${ui.td} font-mono text-muted`}>{r.case_code ?? "—"}</td>
                  <td className={ui.td}>{r.auto?.tagging ?? "—"}</td>
                  <td className={ui.td}>{r.auto?.timeline ?? "—"}</td>
                  <td className={ui.td}>{r.auto?.hypothesis ?? "—"}</td>
                  <td className={ui.td}>{r.auto?.root_cause ?? "—"}</td>
                  <td className={`${ui.td} font-semibold`}>{r.auto?.total ?? "—"}</td>
                  <td className={ui.td} title={`culprit ${r.judge.responsible} · reasoning ${r.judge.reasoning} · clues ${r.judge.evidence_based} · presentation ${r.judge.presentation}`}>{r.judge.total}</td>
                  <td className={`${ui.td} text-muted`}>{r.judgeCount}/{r.judgesAssigned}</td>
                  <td className={`${ui.td} text-lg font-bold`}>{r.total}</td>
                  <td className={ui.td}>{r.shortlist ? `#${r.shortlist.presentation_order}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Ties break on the earlier final submission time. Hover the judge column for the breakdown.</p>
      </section>
    </div>
  );
}
