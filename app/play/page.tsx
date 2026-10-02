import Link from "next/link";
import CaseArt from "@/components/CaseArt";
import TeamFrame from "@/components/play/TeamFrame";
import TeamHelp from "@/components/play/TeamHelp";
import { EmptyState, NextAction } from "@/components/ui";
import { nextStep } from "@/lib/journey";
import { getPlayContext } from "@/lib/play";

export const dynamic = "force-dynamic";

export default async function CasePage() {
  const ctx = await getPlayContext();
  const { team, caseRow, twistText, submissions, event, counts } = ctx;

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

  const next = nextStep({
    phase: event?.phase ?? "waiting",
    initial: submissions.get("initial"),
    final: submissions.get("final"),
    round1: counts.round1,
    round1Answered: counts.round1Answered,
    twist: counts.twist,
    twistAnswered: counts.twistAnswered,
    timeUp: ctx.timeUp,
  });

  return (
    <div className="space-y-6">
      <TeamFrame />
      <NextAction title={next.title} body={next.body} href={next.href} cta={next.cta} tone={next.tone} />

      {twistText !== null && (
        <section className="rounded-xl border-2 border-danger/70 bg-danger/10 p-5">
          <p className="stamp text-danger">New evidence</p>
          <p className="mt-3 whitespace-pre-line text-lg">{twistText}</p>
          <p className="mt-2 text-sm text-muted">Open the Questions tab: the new clues are marked “New”. Then give your Final Report.</p>
        </section>
      )}

      <article className="overflow-hidden rounded-xl border border-line bg-panel">
        <CaseArt code={caseRow.code} />
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{caseRow.code} · case file</span>
            <span className="stamp text-accent">Confidential</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{caseRow.title}</h1>
          <p className="mt-4 max-w-3xl whitespace-pre-line text-[17px] leading-relaxed text-text/95">{caseRow.briefing_md}</p>

          <h2 className="mt-6 text-lg font-bold">The suspects</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {caseRow.root_cause_options.map((s, i) => (
              <li key={s} className="flex items-center gap-3 rounded-lg border border-line bg-ink px-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel2 font-mono text-sm font-bold text-accent">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex justify-end">
            <Link prefetch={false} href="/play/questions" className="rounded-lg bg-accent px-7 py-3 text-lg font-bold text-white hover:brightness-110">
              Next: the clues →
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}

function HowItWorks() {
  const items = [
    ["1", "Read the case", "A short story, a picture and the suspects."],
    ["2", "Answer the questions", "Each question shows one clue with four options."],
    ["3", "Initial Conclusion", "Say who you think did it, and why."],
    ["4", "Twist + Final Report", "New evidence arrives. Give your final answer."],
  ];
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="font-semibold">How it works</h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([n, t, d]) => (
          <li key={n} className="rounded-lg border border-line bg-ink p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-white">{n}</span>
            <p className="mt-2 text-sm font-semibold">{t}</p>
            <p className="mt-1 text-xs text-muted">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
