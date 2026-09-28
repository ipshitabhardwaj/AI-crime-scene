import Link from "next/link";
import Sealed from "@/components/play/Sealed";
import { EVIDENCE_META } from "@/components/evidence/meta";
import { TAG_STYLES } from "@/lib/phase";
import { getPlayContext } from "@/lib/play";
import type { EvidenceType, Stage, Submission } from "@/lib/types";
import type { EventPhase } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function CaseFilePage({ searchParams }: { searchParams: Promise<{ type?: string; tag?: string }> }) {
  const { type, tag } = await searchParams;
  const { team, caseRow, evidence, tags, twistText, submissions, event, stage, writable, closedReason } = await getPlayContext();

  if (!caseRow) {
    return (
      <div className="space-y-6">
        <TeamCard name={team.name} code={team.team_code} members={team.members.map((m) => m.name)} />
        <Sealed />
      </div>
    );
  }

  const tagged = evidence.filter((e) => tags.get(e.id)?.tag).length;
  const types = Array.from(new Set(evidence.map((e) => e.type)));
  const shown = evidence.filter((e) => {
    if (type && e.type !== type) return false;
    const t = tags.get(e.id)?.tag ?? "untagged";
    if (tag && t !== tag) return false;
    return true;
  });

  const qs = (next: { type?: string; tag?: string }) => {
    const p = new URLSearchParams();
    const merged = { type, tag, ...next };
    if (merged.type) p.set("type", merged.type);
    if (merged.tag) p.set("tag", merged.tag);
    const s = p.toString();
    return s ? `/play?${s}` : "/play";
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-text"}`;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-panel p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">{caseRow.code}</p>
        <h1 className="mt-1 text-2xl font-bold">{caseRow.title}</h1>
        <p className="mt-3 whitespace-pre-line leading-relaxed text-text/90">{caseRow.briefing_md}</p>
      </section>

      <Progress
        tagged={tagged}
        total={evidence.length}
        initial={submissions.get("initial")}
        final={submissions.get("final")}
        phase={event?.phase ?? "waiting"}
        stage={stage}
        writable={writable}
        closedReason={closedReason}
      />

      {twistText !== null && (
        <section className="rounded-xl border border-danger/50 bg-danger/10 p-5">
          <p className="font-mono text-xs uppercase tracking-widest text-danger">New evidence released</p>
          <p className="mt-2 whitespace-pre-line">{twistText}</p>
          <p className="mt-2 text-sm text-muted">New items are marked NEW below. Reassess your timeline and report.</p>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Evidence board</h2>
            <p className="text-sm text-muted">
              {tagged} of {evidence.length} tagged. Open an item to read it and tag it.
            </p>
          </div>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-accent" style={{ width: `${evidence.length ? (100 * tagged) / evidence.length : 0}%` }} />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Link prefetch={false} href={qs({ type: undefined })} className={chip(!type)}>All types</Link>
          {types.map((t) => (
            <Link prefetch={false} key={t} href={qs({ type: t })} className={chip(type === t)}>{EVIDENCE_META[t as EvidenceType].label}</Link>
          ))}
          <span className="mx-1 w-px bg-line" />
          {(["untagged", "relevant", "irrelevant", "misleading"] as const).map((t) => (
            <Link prefetch={false} key={t} href={qs({ tag: tag === t ? undefined : t })} className={chip(tag === t)}>
              {t === "untagged" ? "Untagged" : TAG_STYLES[t].label}
            </Link>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => {
            const t = tags.get(e.id);
            const meta = EVIDENCE_META[e.type];
            return (
              <Link
                key={e.id}
                prefetch={false}
                href={`/play/evidence/${e.id}`}
                className="group rounded-xl border border-line bg-panel p-4 transition hover:border-accent"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-accent">{e.code}</span>
                  <span className="text-muted">
                    {meta.icon} {meta.label}
                  </span>
                  {e.is_twist && <span className="rounded bg-danger px-1.5 py-0.5 font-bold text-white">NEW</span>}
                  {t?.tag && <span className={`ml-auto rounded border px-2 py-0.5 ${TAG_STYLES[t.tag].cls}`}>{TAG_STYLES[t.tag].label}</span>}
                </div>
                <p className="mt-2 font-medium group-hover:text-accent">{e.title}</p>
                {e.time_label && <p className="mt-1 font-mono text-xs text-muted">{e.time_label}</p>}
                {t?.note && <p className="mt-2 line-clamp-2 text-sm text-muted">“{t.note}”</p>}
              </Link>
            );
          })}
          {shown.length === 0 && <p className="text-muted">No evidence matches this filter.</p>}
        </div>
      </section>
    </div>
  );
}

function TeamCard({ name, code, members }: { name: string; code: string; members: string[] }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">Team</p>
      <h1 className="mt-1 text-2xl font-bold">{name}</h1>
      <p className="mt-1 font-mono text-accent">{code}</p>
      {members.length > 0 && <p className="mt-3 text-sm text-muted">{members.join(" · ")}</p>}
    </section>
  );
}

function Progress({
  tagged,
  total,
  initial,
  final,
  phase,
  stage,
  writable,
  closedReason,
}: {
  tagged: number;
  total: number;
  initial?: Submission;
  final?: Submission;
  phase: EventPhase;
  stage: Stage | null;
  writable: boolean;
  closedReason: string;
}) {
  const status = (s?: Submission) => (s?.submitted_at ? "✓ submitted" : s?.locked ? "auto-locked" : "not submitted");
  const todo =
    stage === "initial"
      ? writable
        ? "Tag every item, build your timeline, then submit your initial conclusion on the Report tab."
        : closedReason
      : stage === "final"
        ? writable
          ? "New evidence is out. Re-check your tags and timeline, then submit your final report."
          : closedReason
        : phase === "initial_locked"
          ? "Initial answers are locked. Wait for the twist."
          : phase === "closed" || phase === "presentations" || phase === "results"
            ? "Submissions are closed. Judging is in progress."
            : "";
  const cell = "rounded-lg border border-line px-3 py-2";
  return (
    <section className="rounded-xl border border-line bg-panel p-4" aria-label="Your progress">
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div className={cell}><span className="text-muted">Tagged</span> <b>{tagged}/{total}</b></div>
        <div className={cell}><span className="text-muted">Initial report</span> <b className={initial?.submitted_at ? "text-ok" : ""}>{status(initial)}</b></div>
        <div className={cell}><span className="text-muted">Final report</span> <b className={final?.submitted_at ? "text-ok" : ""}>{status(final)}</b></div>
      </div>
      {todo && <p className="mt-3 text-sm"><span className="text-accent">Now:</span> {todo}</p>}
    </section>
  );
}
