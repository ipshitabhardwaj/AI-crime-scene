import type { EventPhase } from "./constants";
import type { Submission } from "./types";

/**
 * The single most useful thing a team can do right now, derived from the
 * phase and its own progress. Drives the "What to do now" card.
 */
export type NextStep = { title: string; body: string; href?: string; cta?: string; tone: "accent" | "ok" | "neutral" | "danger" };

export type JourneyInput = {
  phase: EventPhase;
  initial?: Submission;
  final?: Submission;
  round1: number;
  round1Answered: number;
  twist: number;
  twistAnswered: number;
  timeUp: boolean;
};

export function nextStep(i: JourneyInput): NextStep {
  const initialDone = !!i.initial?.submitted_at || !!i.initial?.locked;
  const finalDone = !!i.final?.submitted_at || !!i.final?.locked;
  const left = i.round1 - i.round1Answered;
  const twistLeft = i.twist - i.twistAnswered;
  const s = (n: number) => (n === 1 ? "" : "s");

  if (i.phase === "waiting") return { title: "Stand by — the case opens soon", body: "Stay logged in. This page switches on its own when the investigation starts.", tone: "neutral" };
  if (i.phase === "investigation") {
    if (i.timeUp) return { title: "Time is up for this round", body: "Your answers are saved. Wait for the organisers.", tone: "neutral" };
    if (left > 0 && !initialDone)
      return { title: left === i.round1 ? "Read the case, then answer the questions" : `${left} question${s(left)} left`, body: "Each question shows one clue. Pick the best answer.", href: "/play/questions", cta: left === i.round1 ? "Start the questions" : "Continue", tone: "accent" };
    if (!initialDone) return { title: "Submit your Initial Conclusion", body: "All questions answered. Now say who you think did it.", href: "/play/report", cta: "Who did it?", tone: "accent" };
    return { title: "Initial Conclusion submitted ✓", body: left > 0 ? `You can still answer the ${left} question${s(left)} you skipped until the organisers lock round 1.` : "You can still change your answers until the organisers lock round 1.", href: "/play/questions", cta: "Review answers", tone: "ok" };
  }
  if (i.phase === "initial_locked") return { title: "Round 1 locked", body: "Stand by. New evidence is coming.", tone: "neutral" };
  if (i.phase === "twist" || i.phase === "final") {
    if (finalDone) return { title: "Final Report submitted ✓", body: "Nothing more to do. Wait for the results.", tone: "ok" };
    if (i.timeUp) return { title: "Time is up", body: "Your saved answers will be scored as they are.", tone: "neutral" };
    if (twistLeft > 0) return { title: `New evidence! ${twistLeft} new question${s(twistLeft)}`, body: "Do not submit your Final Report yet. First read the new clues and answer the new questions.", href: "/play/questions", cta: "See the new clues", tone: "danger" };
    return { title: "Submit your Final Report", body: "Did the new evidence change your mind? Give your final answer.", href: "/play/report", cta: "Final answer", tone: "accent" };
  }
  if (i.phase === "results") return { title: "Results are out", body: "See your score and the final leaderboard. Thanks for investigating!", href: "/play/results", cta: "See your score", tone: "ok" };
  return { title: "Submissions are closed", body: "Judges are scoring. Shortlisted teams will be called to present.", tone: "neutral" };
}
