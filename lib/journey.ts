import type { EventPhase } from "./constants";
import type { Submission } from "./types";

/**
 * A team's journey through the event, derived from the phase and its own
 * work. Drives the stepper and the "What to do now" card on every team page.
 */
export type JourneyStep = { label: string; state: "done" | "current" | "todo"; hint?: string };
export type NextStep = { title: string; body: string; href?: string; cta?: string; tone: "accent" | "ok" | "neutral" | "danger" };

export type JourneyInput = {
  phase: EventPhase;
  initial?: Submission;
  final?: Submission;
  tagged: number;
  total: number;
  untaggedTwist: number;
  timelineSteps: number;
  timeUp: boolean;
};

const ORDER: EventPhase[] = ["waiting", "investigation", "initial_locked", "twist", "final", "closed", "presentations", "results"];
const at = (p: EventPhase) => ORDER.indexOf(p);

export function journey(i: JourneyInput): { steps: JourneyStep[]; next: NextStep } {
  const p = at(i.phase);
  const initialDone = !!i.initial?.submitted_at || !!i.initial?.locked;
  const finalDone = !!i.final?.submitted_at || !!i.final?.locked;
  const state = (done: boolean, current: boolean) => (done ? "done" : current ? "current" : "todo") as JourneyStep["state"];

  const steps: JourneyStep[] = [
    { label: "Investigate", hint: "Tag evidence, build the timeline", state: state(p > at("investigation"), i.phase === "investigation" && !initialDone) },
    { label: "Initial Conclusion", hint: "Submit it before the lock", state: state(initialDone, i.phase === "investigation" && !initialDone) },
    { label: "Twist", hint: "New evidence, re-check", state: state(p > at("final") || finalDone, p >= at("initial_locked") && p <= at("final") && !finalDone) },
    { label: "Final report", hint: "Submit your conclusion", state: state(finalDone, (i.phase === "twist" || i.phase === "final") && !finalDone) },
    { label: "Judging", hint: "Top teams present", state: state(p >= at("results"), i.phase === "closed" || i.phase === "presentations") },
    { label: "Results", state: state(false, i.phase === "results") },
  ];
  // "Investigate" and "Hypothesis" are both live during the investigation.
  if (i.phase === "investigation" && initialDone) steps[0].state = "current";

  let next: NextStep;
  const left = i.total - i.tagged;
  if (i.phase === "waiting") {
    next = { title: "Stand by — the case opens soon", body: "Stay logged in. This page switches on its own when the investigation starts.", tone: "neutral" };
  } else if (i.phase === "investigation") {
    if (i.timeUp) next = { title: "Time is up for this phase", body: "Your work is saved. Wait for the organisers.", tone: "neutral" };
    else if (!initialDone && left > 0)
      next = { title: `Tag the evidence — ${left} item${left === 1 ? "" : "s"} left`, body: "Open each item, read it, and mark it Relevant, Misleading or Irrelevant.", href: "#evidence", cta: "Go to evidence", tone: "accent" };
    else if (!initialDone && i.timelineSteps < 3)
      next = { title: "Build your incident timeline", body: "Put the key events in order and link each one to its evidence.", href: "/play/timeline", cta: "Open timeline", tone: "accent" };
    else if (!initialDone)
      next = { title: "Submit your Initial Conclusion", body: "Commit to your best explanation before the lock. You can keep investigating afterwards.", href: "/play/report", cta: "Open report", tone: "accent" };
    else
      next = { title: "Initial Conclusion submitted ✓", body: "Keep refining your tags and timeline until the organisers lock the investigation.", href: "/play/timeline", cta: "Refine timeline", tone: "ok" };
  } else if (i.phase === "initial_locked") {
    next = { title: "Round 1 locked", body: "Stand by for new evidence. Your work is saved.", tone: "neutral" };
  } else if (i.phase === "twist" || i.phase === "final") {
    if (finalDone) next = { title: "Final report submitted ✓", body: "Nothing more to do. Wait for the results.", tone: "ok" };
    else if (i.timeUp) next = { title: "Time is up for this phase", body: "Your saved draft will be locked and scored.", tone: "neutral" };
    else if (i.untaggedTwist > 0)
      next = { title: `New evidence released — ${i.untaggedTwist} item${i.untaggedTwist === 1 ? "" : "s"} to review`, body: "Read the new items (marked NEW), tag them, then rethink your conclusion.", href: "#evidence", cta: "See new evidence", tone: "danger" };
    else
      next = { title: "Update and submit your final report", body: "Adjust your timeline and conclusion to the new evidence, then press Submit.", href: "/play/report", cta: "Open final report", tone: "accent" };
  } else if (i.phase === "results") {
    next = { title: "Results are out", body: "Look at the big screen. Thanks for investigating!", tone: "ok" };
  } else {
    next = { title: "Submissions are closed", body: "Judges are scoring. Shortlisted teams will be called to present.", tone: "neutral" };
  }
  return { steps, next };
}
