import Link from "next/link";
import { notFound } from "next/navigation";
import EvidenceView from "@/components/evidence/EvidenceView";
import { EVIDENCE_META } from "@/components/evidence/meta";
import { TAG_STYLES } from "@/lib/phase";
import { createClient } from "@/lib/supabase/server";
import type { CaseRow, EvidenceRow } from "@/lib/types";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

type Key = { evidence_id: string; tag: string; timeline_pos: number | null };

export default async function CasePreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("cases").select("*").eq("id", id).maybeSingle<CaseRow>();
  if (!c) notFound();

  const [{ data: evidence }, { data: answer }, { data: twist }] = await Promise.all([
    supabase.from("evidence").select("*").eq("case_id", id).order("sort_order").returns<EvidenceRow[]>(),
    supabase.from("answer_key").select("*").eq("case_id", id).maybeSingle(),
    supabase.from("case_twists").select("twist_md").eq("case_id", id).maybeSingle(),
  ]);
  const ev = evidence ?? [];
  const { data: keys } = await supabase.from("answer_evidence").select("*").in("evidence_id", ev.map((e) => e.id)).returns<Key[]>();
  const keyOf = new Map((keys ?? []).map((k) => [k.evidence_id, k]));
  const timeline = ev.filter((e) => keyOf.get(e.id)?.timeline_pos).sort((a, b) => keyOf.get(a.id)!.timeline_pos! - keyOf.get(b.id)!.timeline_pos!);

  return (
    <div className="space-y-6">
      <Link href="/admin/cases" className="text-sm text-muted hover:text-text">← Cases</Link>
      <section className={ui.card}>
        <p className="font-mono text-xs text-accent">{c.code}</p>
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="mt-3 whitespace-pre-line">{c.briefing_md}</p>
        {twist?.twist_md && <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm"><b>Twist text:</b> {twist.twist_md}</p>}
      </section>

      <section className="rounded-xl border border-accent/40 bg-accent/5 p-5">
        <h2 className="font-semibold text-accent">Answer key (staff only)</h2>
        {answer ? (
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div><dt className="text-muted">Before twist</dt><dd>{answer.root_cause_category} · {answer.responsible}</dd><dd className="text-muted">{answer.root_cause_md}</dd></div>
            <div><dt className="text-muted">After twist (scored)</dt><dd className="font-semibold">{answer.post_twist_category}</dd><dd>{answer.post_twist_responsible}</dd></div>
          </dl>
        ) : <p className="text-sm text-muted">Missing.</p>}
        <p className="mt-4 text-sm text-muted">Correct timeline:</p>
        <ol className="mt-1 list-decimal pl-5 text-sm">
          {timeline.map((e) => <li key={e.id}><span className="font-mono text-accent">{e.code}</span> {e.time_label && <span className="font-mono text-muted">[{e.time_label}]</span>} {e.title}</li>)}
        </ol>
      </section>

      <section className="space-y-6">
        {ev.map((e) => {
          const k = keyOf.get(e.id);
          return (
            <article key={e.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-accent">{e.code}</span>
                <span className="font-semibold">{e.title}</span>
                <span className="text-sm text-muted">{EVIDENCE_META[e.type].label}</span>
                {e.is_twist && <span className="rounded bg-danger px-2 py-0.5 text-xs font-bold text-white">TWIST</span>}
                {k && <span className={`ml-auto rounded border px-2 py-0.5 text-xs ${TAG_STYLES[k.tag].cls}`}>{TAG_STYLES[k.tag].label}{k.timeline_pos ? ` · step ${k.timeline_pos}` : ""}</span>}
              </div>
              <EvidenceView evidence={e} />
            </article>
          );
        })}
      </section>
    </div>
  );
}
