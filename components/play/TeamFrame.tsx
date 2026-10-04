import PlayNav, { type NavBadges } from "@/components/play/PlayNav";
import ReopenNotice from "@/components/play/ReopenNotice";
import TeamHelp from "@/components/play/TeamHelp";
import TwistAlert from "@/components/play/TwistAlert";
import { getPlayContext } from "@/lib/play";

/** Section tabs with live counts + "How to play"; rendered by every team page (not the layout) so counts stay fresh. */
export default async function TeamFrame() {
  const ctx = await getPlayContext();
  if (!ctx.caseRow) return null;
  const sub = ctx.submissions.get(ctx.shownStage);
  const c = ctx.counts;
  const twistOut = ctx.shownStage === "final" && c.twist > 0;
  const done = twistOut ? c.twistAnswered : c.round1Answered;
  const total = twistOut ? c.twist : c.round1;
  // After the twist: the new questions come before the Final Report.
  const newLeft = twistOut && ctx.twistWritable ? c.twist - c.twistAnswered : 0;
  const badges: NavBadges = {
    questions: `${done}/${total} ${twistOut ? "new " : ""}answered`,
    questionsTone: done === total && total > 0 ? "ok" : newLeft > 0 ? "accent" : "muted",
    report: sub?.submitted_at ? "submitted ✓" : sub?.locked ? "auto-locked" : newLeft > 0 ? "new questions first" : "not submitted",
    reportTone: sub?.submitted_at ? "ok" : sub?.locked ? "accent" : "muted",
    results: ctx.event?.phase === "results",
  };
  const twistAt = ctx.event?.twist_released_at;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <PlayNav badges={badges} />
        </div>
        <TeamHelp />
      </div>
      {twistAt && ctx.twistWritable && c.twist > 0 && <TwistAlert teamCode={ctx.team.team_code} releasedAt={twistAt} newQuestions={c.twist} />}
      <ReopenNotice teamCode={ctx.team.team_code} stage={ctx.shownStage} submitted={!!sub?.submitted_at} writable={ctx.reportWritable} />
    </div>
  );
}
