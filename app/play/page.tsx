import Link from "next/link";
import { EVIDENCE_META } from "@/components/evidence/meta";
import TeamFrame from "@/components/play/TeamFrame";
import TeamHelp from "@/components/play/TeamHelp";
import { EmptyState, NextAction, Progress } from "@/components/ui";
import { journey } from "@/lib/journey";
import { TAG_STYLES } from "@/lib/phase";
import { getPlayContext } from "@/lib/play";
import type { EvidenceTag } from "@/lib/types";

export const dynamic = "force-dynamic";

const TAG_BAR: Record<EvidenceTag | "none", string> = {
  relevant: "bg-ok",
  misleading: "bg-danger",
  irrelevant: "bg-muted",
  none: "bg-line",
};

export default async function CaseFilePage({ searchParams }: { searchParams: Promise<{ type?: string; tag?: string }> }) {
  const { type, tag } = await searchParams;
  const ctx = await getPlayContext();
  const { team, caseRow, evidence, tags, twistText, submissions, event } = ctx;

  if (!caseRow) {
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-line bg-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Your team</p>
            <TeamHelp />
          </div>
          <h1 className="mt-1 text-2xl font-bold">{team.name}</h1>
          <p className="mt-1 font-mono text-accent">{team.team_code}</p>
          {team.members.length > 0 && <p className="mt-3 text-sm text-muted">{team.members.map((m) => m.name).join(" · ")}</p>}
        </section>
        <EmptyState title="Case sealed">Your case file opens when the investigation starts. This page updates on its own — stay logged in.</EmptyState>
        <HowItWorks />
      </div>
    );
  }

  const tagOf = (id: string) => tags.get(id)?.tag ?? null;
  const tagged = evidence.filter((e) => tagOf(e.id)).length;
  const count = (t: EvidenceTag | "untagged") => evidence.filter((e) => (tagOf(e.id) ?? "untagged") === t).length;
  const { next } = journey({
    phase: event?.phase ?? "waiting",
    initial: submissions.get("initial"),
    final: submissions.get("final"),
    tagged,
    total: evidence.length,
    untaggedTwist: evidence.filter((e) => e.is_twist && !tagOf(e.id)).length,
    timelineSteps: ctx.timelineCount(ctx.shownStage),
    timeUp: ctx.timeUp,
  });

    const shown = evidence.filter((e) => {
    if (type && e.type !== type) return false;
    if (tag && (tagOf(e.id) ?? "untagged") !== tag) return false;
    return true;
  });
  // New twist items first, so nobody misses them.
  const ordered = [...shown].sort((a, b) => Number(b.is_twist) - Number(a.is_twist));

  const qs = (n: { type?: string; tag?: string }) => {
    const p = new URLSearchParams();
    const m = { type, tag, ...n };
    if (m.type) p.set("type", m.type);
    if (m.tag) p.set("tag", m.tag);
    const s = p.toString();
    return s ? `/play?${s}#evidence` : "/play#evidence";
  };
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${active ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-text"}`;

  return (
    <div className="space-y-6">
      <TeamFrame />
      <NextAction title={next.title} body={next.body} href={next.href} cta={next.cta} tone={next.tone} />

      {twistText !== null && (
        <section className="rounded-xl border border-danger/60 bg-danger/10 p-5">
          <p className="stamp text-danger">New evidence released</p>
          <p className="mt-3 whitespace-pre-line">{twistText}</p>
          <p className="mt-2 text-sm text-muted">The new items are at the top of the evidence board, marked NEW. Re-check your timeline and conclusion.</p>
        </section>
      )}

      <details open={event?.phase === "investigation" && tagged === 0} className="group rounded-xl border border-line bg-panel">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{caseRow.code} · case briefing</span>
          <span className="stamp text-danger/80">Confidential</span>
          <h1 className="w-full text-2xl font-bold tracking-tight">{caseRow.title}</h1>
          <span className="text-sm text-accent group-open:hidden">Read what happened ▾</span>
        </summary>
        <p className="whitespace-pre-line px-5 pb-5 leading-relaxed text-text/90">{caseRow.briefing_md}</p>
      </details>

      <section id="evidence" className="scroll-mt-20 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Evidence board</h2>
            <p className="text-sm text-muted">Click an item to read it, then tag it.</p>
          </div>
          <div className="w-full max-w-xs space-y-1">
            <div className="flex justify-between text-xs text-muted">
              <span>Tagged</span>
              <span className="font-mono">
                {tagged}/{evidence.length}
              </span>
            </div>
            <Progress value={tagged} max={evidence.length} tone={tagged === evidence.length ? "ok" : "accent"} label="Evidence tagged" />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Show:</span>
            <Link prefetch={false} href={qs({ tag: undefined })} className={chip(!tag)}>All {evidence.length}</Link>
            {(["untagged", "relevant", "misleading", "irrelevant"] as const).map((t) => (
              <Link prefetch={false} key={t} href={qs({ tag: tag === t ? undefined : t })} className={chip(tag === t)}>
                {t !== "untagged" && <span className={`h-2 w-2 rounded-full ${TAG_BAR[t]}`} />}
                {t === "untagged" ? "Untagged" : TAG_STYLES[t].label} <span className="font-mono">{count(t)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((e) => {
            const t = tags.get(e.id);
            const meta = EVIDENCE_META[e.type];
            return (
              <Link
                key={e.id}
                prefetch={false}
                href={`/play/evidence/${e.id}`}
                className={`group relative overflow-hidden rounded-xl border bg-panel p-4 pl-5 transition hover:border-accent ${e.is_twist ? "border-danger/60" : "border-line"}`}
              >
                <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${TAG_BAR[t?.tag ?? "none"]}`} />
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-accent">{e.code}</span>
                  <span className="text-muted">
                    {meta.icon} {meta.label}
                  </span>
                  {e.is_twist && <span className="rounded bg-danger px-1.5 py-0.5 font-bold text-white">NEW</span>}
                  <span className="ml-auto">
                    {t?.tag ? (
                      <span className={`rounded border px-2 py-0.5 ${TAG_STYLES[t.tag].cls}`}>{TAG_STYLES[t.tag].label}</span>
                    ) : (
                      <span className="rounded border border-dashed border-line px-2 py-0.5 text-muted">Not tagged</span>
                    )}
                  </span>
                </div>
                <p className="mt-2 font-medium group-hover:text-accent">{e.title}</p>
                {e.time_label && <p className="mt-1 font-mono text-xs text-muted">🕑 {e.time_label}</p>}
                {t?.note && <p className="mt-2 line-clamp-2 text-sm text-muted">“{t.note}”</p>}
              </Link>
            );
          })}
        </div>
        {ordered.length === 0 && <EmptyState title="Nothing here">No evidence matches this filter.</EmptyState>}
      </section>
    </div>
  );
}

function HowItWorks() {
  const items = [
    ["1", "Investigate", "Read every evidence item and tag it Relevant, Misleading or Irrelevant. Build the incident timeline."],
    ["2", "Initial Conclusion", "Submit your Initial Conclusion before the lock. You can keep tagging and building the timeline until then."],
    ["3", "Twist", "New evidence appears. Re-check your tags and timeline."],
    ["4", "Final Report", "Submit your final answer with the evidence that proves it."],
  ];
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="font-semibold">How the investigation works</h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([n, t, d]) => (
          <li key={n} className="rounded-lg border border-line bg-ink p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-ink">{n}</span>
            <p className="mt-2 text-sm font-semibold">{t}</p>
            <p className="mt-1 text-xs text-muted">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
