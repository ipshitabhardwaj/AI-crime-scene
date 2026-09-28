import Link from "next/link";
import { notFound } from "next/navigation";
import EvidenceView from "@/components/evidence/EvidenceView";
import { EVIDENCE_META } from "@/components/evidence/meta";
import TagPanel from "@/components/play/TagPanel";
import { getPlayContext } from "@/lib/play";

export const dynamic = "force-dynamic";

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { evidence, tags, writable, closedReason } = await getPlayContext();
  const idx = evidence.findIndex((e) => e.id === id);
  if (idx === -1) notFound(); // not visible to this team (yet)
  const e = evidence[idx];
  const prev = evidence[idx - 1];
  const next = evidence[idx + 1];
  const t = tags.get(e.id);
  const meta = EVIDENCE_META[e.type];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <Link prefetch={false} href="/play" className="text-muted hover:text-text">← Evidence board</Link>
        <div className="flex gap-3">
          {prev ? <Link prefetch={false} href={`/play/evidence/${prev.id}`} className="text-muted hover:text-text">← {prev.code}</Link> : <span />}
          {next && <Link prefetch={false} href={`/play/evidence/${next.id}`} className="text-muted hover:text-text">{next.code} →</Link>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg text-accent">{e.code}</span>
            <span className="text-sm text-muted">{meta.icon} {meta.label}</span>
            {e.is_twist && <span className="rounded bg-danger px-2 py-0.5 text-xs font-bold text-white">NEW</span>}
            {e.time_label && <span className="ml-auto font-mono text-sm text-muted">{e.time_label}</span>}
          </div>
          <h1 className="text-xl font-bold">{e.title}</h1>
          <EvidenceView evidence={e} />
        </article>
        <TagPanel key={e.id} evidenceId={e.id} initialTag={t?.tag ?? null} initialNote={t?.note ?? ""} writable={writable} closedReason={closedReason} />
      </div>
    </div>
  );
}
