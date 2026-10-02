import HelpDialog, { HelpSteps } from "@/components/HelpDialog";

/** "How to play" guide for participants. */
export default function TeamHelp() {
  return (
    <HelpDialog label="How to play" title="How to play — The AI Files" storageKey="aif-help-team-v2">
      <p>
        You are the detectives. Read the case, look at the clues and work out <b>who did it</b>. No technical knowledge is needed — just read carefully and think.
      </p>
      <HelpSteps
        steps={[
          ["Read the case (tab 1)", "A short story and the list of suspects."],
          ["Answer the questions (tab 2)", "Each question shows one clue and four options. Tap the best answer. It saves by itself, and you can change it until the round is locked."],
          ["Submit your Initial Conclusion (tab 3)", "Pick who you think did it and explain why in a few sentences. Press Submit."],
          ["The twist", "New evidence arrives with a few new questions. Did it change your mind?"],
          ["Submit your Final Report (tab 3)", "Your final answer: who did it, and how you know."],
        ]}
      />
      <p className="text-muted">
        Tips: there is no negative marking, so answer every question. Your whole team uses the same code and PIN and shares the same answers. The red box at the top always tells you what to do next.
      </p>
    </HelpDialog>
  );
}
