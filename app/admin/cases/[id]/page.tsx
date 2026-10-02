import Link from "next/link";
import { notFound } from "next/navigation";
import CaseArt from "@/components/CaseArt";
import { LETTERS } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { toQuestion, type CaseRow, type EvidenceRow } from "@/lib/types";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

type Key = { evidence_id: string; timeline_pos: number | null };

/** Organiser preview of one case: story, suspects, every question with the correct option. */
export default async function CasePreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("cases").select("*").eq("id", id).maybeSingle<CaseRow>();
  if (!c) notFound();

  const [{ data: evidence }, { data: answer }, { data: twist }] = await Promise.all([
    supabase.from("evidence").select("id, case_id, code, title, content, is_twist, sort_order").eq("case_id", id).order("sort_order").returns<EvidenceRow[]>(),
    supabase.from("answer_key").select("*").eq("case_id", id).maybeSingle(),
    supabase.from("case_twists").select("twist_md").eq("case_id", id).maybeSingle(),
  ]);
  const ev = evidence ?? [];
  const { data: keys } = await supabase.from("answer_evidence").select("evidence_id, timeline_pos").in("evidence_id", ev.map((e) => e.id)).returns<Key[]>();
  const keyOf = new Map((keys ?? []).map((k) => [k.evidence_id, k.timeline_pos]));
  const questions = ev.map(toQuestion);

  return (
    <div className="space-y-6">
      <Link href="/admin/cases" className="text-sm text-muted hover:text-text">← Cases</Link>
      <section className="overflow-hidden rounded-xl border border-line bg-panel">
        <CaseArt code={c.code} />
        <div className="p-5">
          <p className="font-mono text-xs text-accent">{c.code}</p>
          <h1 className="text-2xl font-bold">{c.title}</h1>
          <p className="mt-3 max-w-3xl whitespace-pre-line">{c.briefing_md}</p>
          <p className="mt-3 text-sm text-muted">Suspects: {c.root_cause_options.join(" · ")}</p>
          {twist?.twist_md && <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm"><b>Twist text:</b> {twist.twist_md}</p>}
        </div>
      </section>

      <section className="rounded-xl border border-ok/40 bg-ok/5 p-5">
        <h2 className="font-semibold text-ok">Answer key (staff only)</h2>
        {answer ? (
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-muted">Who really did it (scored)</dt><dd className="text-base font-semibold">{answer.post_twist_category}</dd></div>
            <div><dt className="text-muted">Who the story points to at first</dt><dd>{answer.root_cause_category}</dd></div>
            <div><dt className="text-muted">What happened</dt><dd>{answer.root_cause_md}</dd></div>
          </dl>
        ) : <p className="text-sm text-muted">Missing.</p>}
      </section>

      <section className="space-y-4">
        <h2 className={ui.h2}>Questions ({questions.filter((q) => !q.twist).length} + {questions.filter((q) => q.twist).length} twist)</h2>
        {questions.map((q) => {
          const correct = keyOf.get(q.id);
          return (
            <article key={q.id} className={ui.card}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono font-bold text-accent">{q.code}</span>
                <span className="text-xs uppercase tracking-wide text-muted">{q.clue.label}</span>
                {q.twist && <span className="rounded bg-danger px-2 py-0.5 text-xs font-bold text-ink">TWIST</span>}
              </div>
              <div className="exhibit mt-3 p-4">
                <p className="font-bold">{q.clue.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm">{q.clue.text}</p>
              </div>
              <p className="mt-3 font-semibold">{q.question}</p>
              <ol className="mt-2 space-y-1 text-sm">
                {q.options.map((o, i) => (
                  <li key={i} className={`flex gap-2 rounded px-2 py-1 ${correct === i + 1 ? "bg-ok/15 font-semibold text-ok" : "text-muted"}`}>
                    <span className="font-mono">{LETTERS[i]}</span>
                    <span>{o}{correct === i + 1 ? "  ✓" : ""}</span>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </section>
    </div>
  );
}
