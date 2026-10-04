import TeamFrame from "@/components/play/TeamFrame";
import { EmptyState, PageHeader } from "@/components/ui";
import { getPlayContext } from "@/lib/play";
import { getLeaderboard, getTeamAnswerMarks } from "@/lib/results";
import { AUTO_PARTS, JUDGE_CRITERIA, MAX_AUTO } from "@/lib/scoring";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Tab 4, Results phase only: the team's own score card and the final
 * leaderboard. Scores are not readable by teams through the database, so this
 * page reads them on the server — and only after the organisers pressed
 * "Reveal results". It shows right/wrong per question, never the correct option.
 */
export default async function ResultsPage() {
  const { team, event, caseRow } = await getPlayContext();

  if (event?.phase !== "results") {
    return (
      <div className="space-y-6">
        <TeamFrame />
        <EmptyState title="Results are not out yet">Your score and the leaderboard appear here when the organisers reveal the results. This page updates on its own.</EmptyState>
      </div>
    );
  }

  const db = createAdminClient();
  const [all, marks] = await Promise.all([getLeaderboard(db), caseRow ? getTeamAnswerMarks(db, team.id, caseRow.id) : Promise.resolve([])]);
  // Same list as the projector: real teams only, unless there are none (dry run).
  const real = all.filter((r) => !r.is_dummy);
  const board = (real.length ? real : all).map((r, i) => ({ ...r, rank: i + 1 }));
  const me = board.find((r) => r.id === team.id) ?? all.find((r) => r.id === team.id);
  const judged = (me?.judgeCount ?? 0) > 0;
  const round1 = marks.filter((m) => !m.twist);
  const twist = marks.filter((m) => m.twist);
  const right = (xs: typeof marks) => xs.filter((m) => m.correct).length;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <div className="space-y-6">
      <TeamFrame />
      <PageHeader kicker="Step 4 · case closed" title="Results" description="Your team's score, then the final leaderboard." />

      {me ? (
        <section aria-label="Your score" className="rounded-xl border-2 border-accent bg-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Your team</p>
              <p className="text-xl font-bold">{team.name}</p>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Rank</p>
              <p className="text-4xl font-black tabular-nums text-accent">
                {me.rank}
                <span className="text-base font-semibold text-muted"> of {board.length}</span>
              </p>
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Total score</p>
              <p className="text-4xl font-black tabular-nums">{fmt(me.total)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h2 className="font-semibold">
                Detective work <span className="text-sm font-normal text-muted">(automatic, out of {MAX_AUTO})</span>
              </h2>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {AUTO_PARTS.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-1.5">{p.label}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {fmt(me.auto?.[p.id] ?? 0)} <span className="text-muted">/ {p.max}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-line font-bold">
                    <td className="py-1.5">Subtotal</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{fmt(me.auto?.total ?? 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <h2 className="font-semibold">
                Judges <span className="text-sm font-normal text-muted">(out of {JUDGE_CRITERIA.reduce((a, c) => a + c.points, 0)})</span>
              </h2>
              {judged ? (
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {JUDGE_CRITERIA.map((c) => (
                      <tr key={c.id} className="border-t border-line">
                        <td className="py-1.5">{c.label}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {fmt(me.judge[c.id])} <span className="text-muted">/ {c.points}</span>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-line font-bold">
                      <td className="py-1.5">Subtotal</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{fmt(me.judge.total)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 text-sm text-muted">Your team was not scored by the judges, so this part is 0.</p>
              )}
            </div>
          </div>

          {marks.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h2 className="font-semibold">Your answers</h2>
              {[
                { title: `Round 1 — ${right(round1)} of ${round1.length} correct`, list: round1 },
                { title: `New questions — ${right(twist)} of ${twist.length} correct`, list: twist },
              ]
                .filter((g) => g.list.length > 0)
                .map((g) => (
                  <div key={g.title} className="mt-3">
                    <p className="text-sm text-muted">{g.title}</p>
                    <ol className="mt-1.5 flex flex-wrap gap-1.5">
                      {g.list.map((m) => (
                        <li
                          key={m.code}
                          aria-label={`${m.code}: ${m.correct ? "correct" : m.answered ? "wrong" : "not answered"}`}
                          className={`flex h-9 min-w-12 items-center justify-center gap-1 rounded-md border px-2 font-mono text-xs font-bold ${m.correct ? "border-ok/60 bg-ok/15 text-ok" : m.answered ? "border-accent/60 bg-accent/15 text-text" : "border-line text-muted"}`}
                        >
                          {m.code} {m.correct ? "✓" : m.answered ? "✗" : "–"}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              <p className="mt-3 text-xs text-muted">✓ correct · ✗ wrong · – not answered</p>
            </div>
          )}
        </section>
      ) : (
        <EmptyState title="No score for your team">Ask the organisers.</EmptyState>
      )}

      <section aria-label="Final leaderboard" className="rounded-xl border border-line bg-panel p-5 sm:p-6">
        <h2 className="text-xl font-bold">Final leaderboard</h2>
        <p className="mt-1 text-sm text-muted">All {board.length} teams. Ties are ordered by who submitted the Final Report first.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Rank</th>
                <th className="py-2 pr-3">Team</th>
                <th className="py-2 pr-3 text-right">Detective</th>
                <th className="py-2 pr-3 text-right">Judges</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => {
                const mine = r.id === team.id;
                return (
                  <tr key={r.id} aria-current={mine ? "true" : undefined} className={`border-t border-line ${mine ? "bg-accent/15 font-bold" : ""}`}>
                    <td className={`py-2 pr-3 font-mono tabular-nums ${r.rank <= 3 ? "text-accent" : "text-muted"}`}>{r.rank}</td>
                    <td className="py-2 pr-3">
                      {r.name}
                      {mine && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">You</span>}
                      {r.institution && <span className="block text-xs font-normal text-muted">{r.institution}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{fmt(r.auto?.total ?? 0)}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{r.judgeCount > 0 ? fmt(r.judge.total) : "–"}</td>
                    <td className="py-2 text-right font-mono text-base tabular-nums">{fmt(r.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
