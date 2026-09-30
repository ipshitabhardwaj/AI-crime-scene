import HelpDialog, { HelpSteps } from "@/components/HelpDialog";
import { TAG_HELP, TAG_STYLES } from "@/lib/phase";

/** "How to play" guide for participants. */
export default function TeamHelp() {
  return (
    <HelpDialog label="How to play" title="How to play — The AI Files" storageKey="aif-help-team-v1">
      <p>
        Something went wrong at a company. Your team is the investigator. Read the evidence, work out <b>what really happened</b> and <b>why</b>, then write a short
        report. You don’t need to know programming — every clue is in plain words.
      </p>
      <HelpSteps
        steps={[
          ["Read and tag the evidence (tab 1)", "Open each item and mark it Relevant, Misleading or Irrelevant. Use the notes box for what you notice."],
          ["Put events in order (tab 2)", "Build a timeline: what happened first, next, last. Link each step to the evidence that shows it."],
          ["Submit your Initial Conclusion (tab 3)", "Before the lock, submit what you think happened and why. You can still tag and fix the timeline afterwards."],
          ["New evidence arrives (the twist)", "Look at the new items marked NEW. Did they change your mind?"],
          ["Submit your Final Report (tab 3)", "Your final answer, the evidence that proves it, and how to stop it happening again."],
        ]}
      />
      <div className="rounded-lg border border-line bg-ink p-3">
        <p className="mb-1 font-semibold">The three tags</p>
        <ul className="space-y-1">
          {(["relevant", "misleading", "irrelevant"] as const).map((t) => (
            <li key={t}>
              <b className={TAG_STYLES[t].cls.split(" ").find((c) => c.startsWith("text-"))}>{TAG_STYLES[t].label}</b> — {TAG_HELP[t]}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-muted">
        Tips: everything saves automatically. Your whole team uses the same code and PIN — let one person edit the timeline and one the report. The yellow box at the top
        always tells you what to do next.
      </p>
    </HelpDialog>
  );
}
