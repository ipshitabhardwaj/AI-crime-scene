import Link from "next/link";
import { notFound } from "next/navigation";
import { saveJudgeScores } from "@/app/actions/judge";
import { requireRole } from "@/lib/auth";
import { getEvent } from "@/lib/event";
import { AUTO_PARTS, JUDGE_CRITERIA, LETTERS, letterToChoice } from "@/lib/scoring";
import { JUDGE_SCORE_PHASES, JUDGE_VIEW_PHASES } from "@/lib/state-machine";
import { createClient } from "@/lib/supabase/server";
import { toQuestion, type EvidenceRow, type Submission } from "@/lib/types";
import { ui } from "@/lib/ui";
import { Field, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function JudgeTeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { userId } = await requireRole("judge");
  const supabase = await createClient();
  const event = await getEvent();
  if (!event || !JUDGE_VIEW_PHASES.includes(event.phase)) {
    return (
      <div className="space-y-4">
        <Link href="/judge" className="text-sm text-muted hover:text-text">← Assigned teams</Link>
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Team work and answer keys open for judges when submissions close.</p>
      </div>
    );
  }
  const canScore = JUDGE_SCORE_PHASES.includes(event.phase);

  // RLS returns the team only if it is assigned to this judge.
  const { data: team } = await supabase.from("teams").select("id, team_code, name, institution, members, case_id").eq("id", teamId).maybeSingle();
  if (!team) notFound();

  const [{ data: evidence }, { data: keys }, { data: answer }, { data: subs }, { data: given }, { data: auto }, { data: mine }, { data: sl }, { data: myTeams }] =
    await Promise.all([
      supabase.from("evidence").select("id, case_id, code, title, content, is_twist, sort_order").eq("case_id", team.case_id).order("sort_order").returns<EvidenceRow[]>(),
      supabase.from("answer_evidence").select("evidence_id, timeline_pos"),
      supabase.from("answer_key").select("*").eq("case_id", team.case_id).maybeSingle(),
      supabase.from("submissions").select("*").eq("team_id", teamId).returns<Submission[]>(),
      supabase.from("evidence_tags").select("evidence_id, note").eq("team_id", teamId),
      supabase.from("auto_scores").select("*").eq("team_id", teamId).maybeSingle(),
      supabase.from("judge_scores").select("criterion, score, comment").eq("judge_id", userId).eq("team_id", teamId),
      supabase.from("shortlist").select("presentation_order").eq("team_id", teamId).maybeSingle(),
      supabase
        .from("judge_assignments")
        .select("team_id, teams(team_code, shortlist(presentation_order))")
        .eq("judge_id", userId)
        .returns<{ team_id: string; teams: { team_code: string; shortlist: { presentation_order: number | null } | null } | null }[]>(),
    ]);

  const questions = (evidence ?? []).map(toQuestion);
  const keyOf = new Map((keys ?? []).map((k) => [k.evidence_id, k.timeline_pos as number | null]));
  const givenOf = new Map((given ?? []).map((g) => [g.evidence_id, letterToChoice(g.note)]));
  const initial = (subs ?? []).find((s) => s.stage === "initial");
  const final = (subs ?? []).find((s) => s.stage === "final");
  const myScore = new Map((mine ?? []).map((m) => [m.criterion, m]));
  const criteria = JUDGE_CRITERIA.filter((c) => c.id !== "presentation" || sl);
  const order = (myTeams ?? [])
    .filter((a) => a.teams)
    .sort((a, b) => (a.teams!.shortlist?.presentation_order ?? 999) - (b.teams!.shortlist?.presentation_order ?? 999) || a.teams!.team_code.localeCompare(b.teams!.team_code))
    .map((a) => a.team_id);
  const assigned = order.includes(teamId);
  const pos = order.indexOf(teamId);
  const nextId = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;


  const nav = "rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text";
  const rows = questions.map((q) => ({ q, correct: keyOf.get(q.id) ?? null, picked: givenOf.get(q.id) ?? null }));
  const right = rows.filter((r) => r.picked !== null && r.picked === r.correct).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/judge" className={nav}>← Assigned teams</Link>
        <span className="flex items-center gap-2 text-xs text-muted">
          {pos >= 0 && `Team ${pos + 1} of ${order.length}`}
          {nextId && <Link href={`/judge/${nextId}`} className={nav}>Next team →</Link>}
        </span>
      </div>

      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm text-accent">{team.team_code}</p>
          <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
          <p className="text-sm text-muted">
            {team.institution} · {(team.members as { name: string }[]).map((m) => m.name).join(", ")}
          </p>
        </div>
        {sl && <Pill tone="accent">Shortlisted · presents #{sl.presentation_order}</Pill>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {answer && (
            <section className="rounded-xl border border-accent/50 bg-accent/5 p-4 text-sm">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Answer key</p>
              <p className="mt-1 text-base">
                Who did it: <b>{answer.post_twist_category}</b>
              </p>
              <p className="mt-1">{answer.root_cause_md}</p>
              <p className="mt-2 text-xs text-muted">The story points to {answer.root_cause_category} at first. Naming that person is the common wrong answer.</p>
            </section>
          )}

          <section className="grid gap-4 xl:grid-cols-2">
            <Report s={initial} title="Initial Conclusion (before the twist)" />
            <Report s={final} title="Final Report (after the twist)" />
          </section>

          <details className={ui.card}>
            <summary className="cursor-pointer font-semibold">
              Question answers <span className="text-sm font-normal text-muted">({right}/{rows.length} correct, scored automatically)</span>
            </summary>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {rows.map(({ q, correct, picked }) => (
                  <tr key={q.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2 font-mono text-accent">{q.code}</td>
                    <td className="py-1.5 pr-2">{q.question}</td>
                    <td className="whitespace-nowrap py-1.5 pr-2 font-mono">{picked ? LETTERS[picked - 1] : <span className="text-muted">—</span>}</td>
                    <td className="whitespace-nowrap py-1.5">{picked !== null && picked === correct ? <span className="text-ok">✓</span> : <span className="text-danger">✗ key {correct ? LETTERS[correct - 1] : "?"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>

        <aside className="h-fit space-y-4 lg:sticky lg:top-4">
          {auto && (
            <section className={ui.card}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Automatic score</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {auto.total}
                <span className="text-base font-normal text-muted">/50</span>
              </p>
              <dl className="mt-2 space-y-1 text-sm">
                {AUTO_PARTS.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <dt className="text-muted">{p.label}</dt>
                    <dd className="font-mono">
                      {auto[p.id]}/{p.max}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="rounded-xl border border-accent/50 bg-panel p-5">
            <h3 className="font-semibold">Your scores</h3>
            {!assigned ? (
              <p className="mt-2 text-sm text-muted">You are not assigned to this team.</p>
            ) : !canScore ? (
              <p className="mt-2 text-sm text-muted">Results have been revealed, so scores are final.</p>
            ) : (
              <form action={saveJudgeScores} className="mt-3 space-y-4">
                <input type="hidden" name="teamId" value={teamId} />
                <input type="hidden" name="back" value={`/judge/${teamId}`} />
                <input type="hidden" name="next" value={nextId ? `/judge/${nextId}` : "/judge"} />
                {criteria.map((c) => {
                  const cur = myScore.get(c.id);
                  return (
                    <div key={c.id} className="space-y-1.5 border-b border-line pb-3 last:border-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{c.label}</p>
                          <p className="text-xs text-muted">{c.help}</p>
                        </div>
                        <label className="flex shrink-0 items-center gap-1 text-sm">
                          <input name={`score_${c.id}`} aria-label={`${c.label} score out of 10`} type="number" min={0} max={10} step={0.5} defaultValue={cur?.score ?? ""} className={`${ui.input} w-16 text-center`} />
                          <span className="text-muted">/10</span>
                        </label>
                      </div>
                      <input name={`comment_${c.id}`} aria-label={`${c.label} comment`} maxLength={1000} defaultValue={cur?.comment ?? ""} placeholder="Comment (optional)" className={`${ui.input} w-full`} />
                      <p className="text-[11px] text-muted">worth {c.points} pts</p>
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-2">
                  <button name="intent" value="save" className={ui.btnGhost}>Save</button>
                  <button name="intent" value="next" className={`${ui.btn} flex-1`}>{nextId ? "Save & next team →" : "Save & back to list"}</button>
                </div>
                <p className="text-xs text-muted">Blank fields are left unchanged.</p>
              </form>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Report({ s, title }: { s?: Submission; title: string }) {
  return (
    <div className={ui.card}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {s && (s.submitted_at ? <Pill tone="ok">submitted {new Date(s.submitted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</Pill> : <Pill tone="accent">auto-locked draft</Pill>)}
      </div>
      {!s ? (
        <p className="mt-2 text-sm text-muted">Nothing submitted.</p>
      ) : (
        <dl className="mt-3 space-y-3">
          <Field label="Who did it">
            <b>{s.root_cause_category}</b>
          </Field>
          <Field label="How they know">{s.what_happened}</Field>
        </dl>
      )}
    </div>
  );
}
