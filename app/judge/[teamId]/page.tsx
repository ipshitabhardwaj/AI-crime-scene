import Link from "next/link";
import { notFound } from "next/navigation";
import { saveJudgeScores } from "@/app/actions/judge";
import { requireRole } from "@/lib/auth";
import { TAG_STYLES } from "@/lib/phase";
import { JUDGE_CRITERIA } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceRow, Submission } from "@/lib/types";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function JudgeTeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { userId } = await requireRole("judge");
  const supabase = await createClient();

  const { data: team } = await supabase.from("teams").select("id, team_code, name, institution, members, case_id").eq("id", teamId).maybeSingle();
  if (!team) notFound();

  const [{ data: evidence }, { data: keys }, { data: answer }, { data: subs }, { data: tl }, { data: auto }, { data: mine }, { data: sl }, { data: myTeams }] =
    await Promise.all([
      supabase.from("evidence").select("*").eq("case_id", team.case_id).order("sort_order").returns<EvidenceRow[]>(),
      supabase.from("answer_evidence").select("evidence_id, tag, timeline_pos"),
      supabase.from("answer_key").select("*").eq("case_id", team.case_id).maybeSingle(),
      supabase.from("submissions").select("*").eq("team_id", teamId).returns<Submission[]>(),
      supabase.from("timeline_entries").select("stage, position, evidence_id, time_label, description").eq("team_id", teamId).order("position"),
      supabase.from("auto_scores").select("*").eq("team_id", teamId).maybeSingle(),
      supabase.from("judge_scores").select("criterion, score, comment").eq("judge_id", userId).eq("team_id", teamId),
      supabase.from("shortlist").select("presentation_order").eq("team_id", teamId).maybeSingle(),
      supabase
        .from("judge_assignments")
        .select("team_id, teams(team_code, shortlist(presentation_order))")
        .eq("judge_id", userId)
        .returns<{ team_id: string; teams: { team_code: string; shortlist: { presentation_order: number | null } | null } | null }[]>(),
    ]);

  const ev = evidence ?? [];
  const keyOf = new Map((keys ?? []).map((k) => [k.evidence_id, k]));
  const codeOf = new Map(ev.map((e) => [e.id, e.code]));
  const initial = (subs ?? []).find((s) => s.stage === "initial");
  const final = (subs ?? []).find((s) => s.stage === "final");
  const finalTags = final?.tags_snapshot ?? initial?.tags_snapshot ?? {};
  const myScore = new Map((mine ?? []).map((m) => [m.criterion, m]));
  const criteria = JUDGE_CRITERIA.filter((c) => c.id !== "presentation" || sl);
  const order = (myTeams ?? [])
    .filter((a) => a.teams)
    .sort((a, b) => (a.teams!.shortlist?.presentation_order ?? 999) - (b.teams!.shortlist?.presentation_order ?? 999) || a.teams!.team_code.localeCompare(b.teams!.team_code))
    .map((a) => a.team_id);
  const assigned = order.includes(teamId);
  const pos = order.indexOf(teamId);
  const nextId = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;


  return (
    <div className="space-y-6">
      <div className="flex justify-between text-sm">
        <Link href="/judge" className="text-muted hover:text-text">← Assigned teams</Link>
        {nextId && <Link href={`/judge/${nextId}`} className="text-muted hover:text-text">Next team →</Link>}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-accent">{team.team_code}</p>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="text-sm text-muted">{team.institution} · {(team.members as { name: string }[]).map((m) => m.name).join(", ")}</p>
        </div>
        {auto && (
          <div className="ml-auto rounded-xl border border-line px-4 py-2 text-sm">
            Auto <b>{auto.total}</b>/50 <span className="text-muted">· tag {auto.tagging} · timeline {auto.timeline} · root {auto.root_cause} · adapt {auto.adaptability}</span>
          </div>
        )}
      </div>

      {answer && (
        <section className="rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">
          <b className="text-accent">Answer key:</b> {answer.post_twist_category} — {answer.post_twist_responsible}
          <span className="text-muted"> (before twist: {answer.root_cause_category} — {answer.responsible})</span>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Report s={initial} title="Initial conclusion" />
        <Report s={final} title="Final report (after twist)" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={ui.card}>
          <h3 className="mb-3 font-semibold">Final timeline</h3>
          <ol className="space-y-1 text-sm">
            {(tl ?? []).filter((x) => x.stage === (tl?.some((y) => y.stage === "final") ? "final" : "initial")).map((x, i) => {
              const k = x.evidence_id ? keyOf.get(x.evidence_id) : undefined;
              return (
                <li key={i} className="flex gap-2">
                  <span className="w-5 text-right text-muted">{x.position}.</span>
                  <span className="w-14 font-mono text-muted">{x.time_label}</span>
                  <span className="w-10 font-mono text-accent">{x.evidence_id ? codeOf.get(x.evidence_id) : ""}</span>
                  <span className="flex-1">{x.description}</span>
                  <span className="text-xs text-muted">{k?.timeline_pos ? `key #${k.timeline_pos}` : "not in key"}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className={ui.card}>
          <h3 className="mb-3 font-semibold">Evidence tags vs key</h3>
          <table className="w-full text-sm">
            <tbody>
              {ev.map((e) => {
                const k = keyOf.get(e.id);
                const t = (finalTags as Record<string, string>)[e.code];
                return (
                  <tr key={e.id} className="border-t border-line">
                    <td className="py-1 pr-2 font-mono text-accent">{e.code}</td>
                    <td className="py-1 pr-2">{e.title}</td>
                    <td className="py-1 pr-2">{t ? <span className={`rounded border px-1.5 text-xs ${TAG_STYLES[t].cls}`}>{t}</span> : <span className="text-muted">—</span>}</td>
                    <td className="py-1">{k && (t === k.tag ? <span className="text-ok">✓</span> : <span className="text-danger" title={`key: ${k.tag}`}>✗ {k.tag}</span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={ui.card}>
        <h3 className="font-semibold">Your scores</h3>
        {!assigned ? (
          <p className="mt-2 text-sm text-muted">You are not assigned to this team, so you can view but not score it.</p>
        ) : (
          <form action={saveJudgeScores} className="mt-4 space-y-4">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="back" value={`/judge/${teamId}`} />
            <input type="hidden" name="next" value={nextId ? `/judge/${nextId}` : "/judge"} />
            {criteria.map((c) => {
              const cur = myScore.get(c.id);
              return (
                <div key={c.id} className="grid gap-2 md:grid-cols-[260px_120px_1fr] md:items-center">
                  <div>
                    <p className="font-medium">{c.label} <span className="text-xs text-muted">({c.points} pts)</span></p>
                    <p className="text-xs text-muted">{c.help}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input name={`score_${c.id}`} aria-label={`${c.label} score out of 10`} type="number" min={0} max={10} step={0.5} defaultValue={cur?.score ?? ""} className={`${ui.input} w-20`} /> /10
                  </label>
                  <input name={`comment_${c.id}`} aria-label={`${c.label} comment`} maxLength={1000} defaultValue={cur?.comment ?? ""} placeholder="Comment (optional)" className={ui.input} />
                </div>
              );
            })}
            <div className="flex flex-wrap gap-3">
              <button name="intent" value="save" className={ui.btnGhost}>Save</button>
              <button name="intent" value="next" className={ui.btn}>{nextId ? "Save & next team →" : "Save & back to list"}</button>
              <span className="self-center text-xs text-muted">Team {pos + 1} of {order.length}. Blank fields are left unchanged.</span>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function Report({ s, title }: { s?: Submission; title: string }) {
return (
  <div className={ui.card}>
    <h3 className="font-semibold">{title}</h3>
    {!s ? <p className="mt-2 text-sm text-muted">Nothing submitted.</p> : (
      <dl className="mt-3 space-y-3 text-sm">
        <div><dt className="text-muted">Root cause</dt><dd className="font-medium">{s.root_cause_category ?? "—"}</dd></div>
        <div><dt className="text-muted">Responsible</dt><dd>{s.responsible || "—"}</dd></div>
        <div><dt className="text-muted">What happened</dt><dd className="whitespace-pre-wrap break-words">{s.what_happened || "—"}</dd></div>
        <div><dt className="text-muted">Root cause explained</dt><dd className="whitespace-pre-wrap break-words">{s.root_cause_md || "—"}</dd></div>
        <div><dt className="text-muted">Key evidence</dt><dd className="font-mono">{s.key_evidence?.join(", ") || "—"}</dd></div>
        <div><dt className="text-muted">Fix / prevention</dt><dd className="whitespace-pre-wrap break-words">{s.fix_md || "—"}</dd></div>
        <div className="text-xs text-muted">{s.submitted_at ? `Submitted ${new Date(s.submitted_at).toLocaleTimeString()}` : "Not submitted (auto-locked draft)"}</div>
      </dl>
    )}
  </div>
);
}
