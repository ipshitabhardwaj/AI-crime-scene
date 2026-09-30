import Link from "next/link";
import { notFound } from "next/navigation";
import EvidenceView from "@/components/evidence/EvidenceView";
import { EVIDENCE_META } from "@/components/evidence/meta";
import TagPanel from "@/components/play/TagPanel";
import TeamFrame from "@/components/play/TeamFrame";
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
  // After this one, jump to the next item that still needs a tag (wrapping round), else the next item.
  const rest = [...evidence.slice(idx + 1), ...evidence.slice(0, idx)];
  const nextUntagged = rest.find((x) => !tags.get(x.id)?.tag);
  const target = nextUntagged ?? next;
  const nav = "rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text";

  return (
    <div className="space-y-5">
      <TeamFrame />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link prefetch={false} href="/play#evidence" className={nav}>← All evidence</Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">
            Item {idx + 1} of {evidence.length}
          </span>
          {prev && <Link prefetch={false} href={`/play/evidence/${prev.id}`} className={nav} aria-label={`Previous: ${prev.code}`}>← {prev.code}</Link>}
          {next && <Link prefetch={false} href={`/play/evidence/${next.id}`} className={nav} aria-label={`Next: ${next.code}`}>{next.code} →</Link>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-md bg-accent/15 px-2 py-0.5 font-mono text-lg font-bold text-accent">{e.code}</span>
            <span className="text-sm text-muted">
              {meta.icon} {meta.label}
            </span>
            {e.is_twist && <span className="rounded bg-danger px-2 py-0.5 text-xs font-bold text-white">NEW</span>}
            {e.time_label && <span className="ml-auto rounded-md border border-line px-2 py-0.5 font-mono text-sm text-muted">🕑 {e.time_label}</span>}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{e.title}</h1>
          <EvidenceView evidence={e} />
        </article>
        <TagPanel
          key={e.id}
          evidenceId={e.id}
          initialTag={t?.tag ?? null}
          initialNote={t?.note ?? ""}
          writable={writable}
          closedReason={closedReason}
          nextHref={target ? `/play/evidence/${target.id}` : "/play#evidence"}
          nextLabel={target ? (nextUntagged ? `Next untagged: ${target.code}` : `Next: ${target.code}`) : "Back to the board"}
        />
      </div>
    </div>
  );
}
