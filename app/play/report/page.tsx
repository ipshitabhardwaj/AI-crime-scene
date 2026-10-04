import TeamFrame from "@/components/play/TeamFrame";
import { EmptyState, PageHeader } from "@/components/ui";
import ReportForm from "@/components/play/ReportForm";
import type { ReportFields } from "@/app/actions/team";
import { getPlayContext } from "@/lib/play";

export const dynamic = "force-dynamic";

const empty: ReportFields = { culprit: null, explanation: "" };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" });

export default async function ReportPage() {
  const { caseRow, counts, reportWritable, initialSubmitted, shownStage, submissions, versions, closedReason, event } = await getPlayContext();
  if (!caseRow) return <EmptyState title="Case sealed">Your case file opens when the investigation starts.</EmptyState>;

  const current = submissions.get(shownStage);
  const submitted = !!current?.submitted_at;
  const autoLocked = !!current?.locked && !submitted;
  const fields: ReportFields = current ? { culprit: current.root_cause_category, explanation: current.what_happened } : empty;
  const initial = submissions.get("initial");
  const version = versions.get(`report_${shownStage}`) ?? 0;
  const next =
    shownStage === "initial"
      ? initialSubmitted
        ? "Your Initial Conclusion is recorded. You can still change your question answers until the organisers lock round 1. After the twist you give your Final Report here."
        : "Next: when the organisers release the twist, new evidence appears and you give your Final Report here."
      : event?.phase === "closed" || event?.phase === "presentations" || event?.phase === "results"
        ? "Submissions are closed. Judging is in progress."
        : "Nothing more to do. Wait for the results.";

  return (
    <div className="space-y-6">
      <TeamFrame />
      <PageHeader
        kicker={shownStage === "initial" ? "Step 3 · before the twist" : "Step 3 · after the twist"}
        title={shownStage === "initial" ? "Initial Conclusion" : "Final Report"}
        description={
          reportWritable
            ? shownStage === "initial"
              ? "Who do you think did it? It saves automatically. Press Submit when you are ready — then it is locked."
              : counts.twist - counts.twistAnswered > 0
                ? "The new evidence is in. Answer the new questions first (Questions tab), then give your final answer here."
                : "The new evidence is in and you answered the new questions. Give your final answer; press Submit when you are ready."
            : closedReason
        }
      />

      {submitted && (
        <div role="status" className="rounded-xl border border-ok/50 bg-ok/10 p-4">
          <p className="font-semibold text-ok">✓ Submitted at {time(current!.submitted_at!)} — received and locked.</p>
          <p className="mt-1 text-sm text-muted">{next}</p>
        </div>
      )}
      {autoLocked && (
        <div role="status" className="rounded-xl border border-accent/50 bg-accent/10 p-4">
          <p className="font-semibold text-accent">Time ran out before you submitted. Your saved draft below was locked and will be scored as it is.</p>
          <p className="mt-1 text-sm text-muted">{next}</p>
        </div>
      )}

      <ReportForm
        key={`${shownStage}-${current?.locked ?? false}-${version}`}
        stage={shownStage}
        initial={fields}
        suspects={caseRow.root_cause_options}
        writable={reportWritable}
        version={version}
        unanswered={shownStage === "final" ? counts.twist - counts.twistAnswered : counts.round1 - counts.round1Answered}
      />

      {shownStage === "final" && initial && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-sm text-muted">Your Initial Conclusion (locked, for comparison)</summary>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-muted">Who did it</dt><dd>{initial.root_cause_category ?? "—"}</dd></div>
            <div><dt className="text-muted">How you knew</dt><dd className="whitespace-pre-wrap break-words">{initial.what_happened || "—"}</dd></div>
          </dl>
        </details>
      )}
    </div>
  );
}
