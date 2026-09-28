import { assignJudges, createShortlist, runAutoScoring } from "@/app/actions/admin-results";
import { getEvent } from "@/lib/event";
import { getLeaderboard } from "@/lib/results";
import { createAdminClient } from "@/lib/supabase/admin";
import { ui } from "@/lib/ui";

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

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className={ui.card}>
          <h2 className="font-semibold">1 · Auto-score</h2>
          <p className="mt-1 text-sm text-muted">Tagging, timeline, root cause and adaptability (50 pts). Re-run any time.</p>
          <form action={runAutoScoring} className="mt-3 space-y-2 text-sm">
            {!closed && (
              <label className="flex items-center gap-2 text-muted"><input type="checkbox" name="confirm" /> score anyway (submissions still open)</label>
            )}
            <button className={ui.btn}>Run auto-scoring</button>
          </form>
          <p className="mt-2 text-xs text-muted">{scored} of {board.length} teams scored. Safe to re-run; it recomputes from the answer keys.</p>
        </div>
        <div className={ui.card}>
          <h2 className="font-semibold">2 · Assign judges</h2>
          <p className="mt-1 text-sm text-muted">Top teams go to judges for the reasoning scores.</p>
          <form action={assignJudges} className="mt-3 space-y-2 text-sm">
            <label className="flex items-center gap-2">Top <input name="topN" type="number" defaultValue={20} className={`${ui.input} w-20`} /> teams</label>
            <label className="flex items-center gap-2"><input name="perTeam" type="number" defaultValue={2} className={`${ui.input} w-20`} /> judges per team</label>
            <label className="flex items-center gap-2 text-muted"><input name="includeDummy" type="checkbox" /> include dummy teams</label>
            <button className={ui.btn}>Assign</button>
          </form>
        </div>
        <div className={ui.card}>
          <h2 className="font-semibold">3 · Shortlist</h2>
          <p className="mt-1 text-sm text-muted">Top teams by total present; every judge can then score their presentation.</p>
          <form action={createShortlist} className="mt-3 space-y-2 text-sm">
            <label className="flex items-center gap-2">Top <input name="size" type="number" defaultValue={10} className={`${ui.input} w-20`} /> teams</label>
            <label className="flex items-center gap-2 text-muted"><input name="includeDummy" type="checkbox" /> include dummy teams</label>
            {shortlisted > 0 && <label className="flex items-center gap-2 text-accent"><input name="confirm" type="checkbox" /> replace the existing shortlist</label>}
            <button className={ui.btn}>Create shortlist</button>
          </form>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-3">
          <h2 className="font-semibold">Leaderboard</h2>
          <span className="text-sm text-muted">Judging: {fullyJudged}/{judgedTeams.length} assigned teams fully scored · shortlist: {shortlisted || "none"}</span>
          <a href="/admin/export" className={`${ui.btnGhost} ml-auto`}>Export CSV</a>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-panel text-muted">
              <tr>
                <th className={ui.th}>#</th><th className={ui.th}>Team</th><th className={ui.th}>Case</th>
                <th className={ui.th} title="Tagging /15">Tag</th><th className={ui.th} title="Timeline /15">TL</th>
                <th className={ui.th} title="Root cause /10">RC</th><th className={ui.th} title="Adaptability /10">Adp</th>
                <th className={ui.th}>Auto /50</th><th className={ui.th}>Judges /50</th><th className={ui.th}>Judged</th>
                <th className={ui.th}>Total</th><th className={ui.th}>Shortlist</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className={ui.td}>{r.rank}</td>
                  <td className={ui.td}><span className="font-mono text-accent">{r.team_code}</span> {r.name}{r.is_dummy && <span className="text-xs text-muted"> (dummy)</span>}</td>
                  <td className={`${ui.td} font-mono text-muted`}>{r.case_code ?? "—"}</td>
                  <td className={ui.td}>{r.auto?.tagging ?? "—"}</td>
                  <td className={ui.td}>{r.auto?.timeline ?? "—"}</td>
                  <td className={ui.td}>{r.auto?.root_cause ?? "—"}</td>
                  <td className={ui.td}>{r.auto?.adaptability ?? "—"}</td>
                  <td className={`${ui.td} font-semibold`}>{r.auto?.total ?? "—"}</td>
                  <td className={ui.td} title={`responsible ${r.judge.responsible} · reasoning ${r.judge.reasoning} · evidence ${r.judge.evidence_based} · presentation ${r.judge.presentation}`}>{r.judge.total}</td>
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
