import QuizRunner from "@/components/play/QuizRunner";
import TeamFrame from "@/components/play/TeamFrame";
import { EmptyState } from "@/components/ui";
import { getPlayContext } from "@/lib/play";

export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  const { caseRow, questions, answers, round1Writable, twistWritable, closedReason, shownStage, twistText } = await getPlayContext();
  if (!caseRow) return <EmptyState title="Case sealed">Your case file opens when the investigation starts.</EmptyState>;

  // After the twist the new questions come first; round 1 stays readable.
  const ordered = shownStage === "final" ? [...questions.filter((q) => q.twist), ...questions.filter((q) => !q.twist)] : questions;

  return (
    <div className="space-y-5">
      <TeamFrame />
      {twistText !== null && shownStage === "final" && (
        <p className="rounded-lg border border-danger/60 bg-danger/10 px-4 py-2.5 text-sm">
          <b className="text-danger">New evidence.</b> {twistText}
        </p>
      )}
      <QuizRunner
        key={`${shownStage}-${round1Writable}-${twistWritable}`}
        questions={ordered}
        initialAnswers={answers}
        round1Writable={round1Writable}
        twistWritable={twistWritable}
        closedReason={closedReason}
        reportLabel={shownStage === "final" ? "Final Report" : "Initial Conclusion"}
      />
    </div>
  );
}
