import type { EventPhase } from "./constants";

/**
 * The event's phase machine — the single source of truth used by the
 * Control room (which buttons exist) and by setPhase (what is allowed).
 * See docs/STATE_MACHINE.md for the full permission matrix.
 *
 *   waiting → investigation → initial_locked → twist → final → closed → presentations → results
 *                                              twist ─────────→ closed   (Final report is optional)
 *                                                               closed ──────────────→ results  (no presentations)
 *
 * Going back is possible only to the immediately previous phase, only with the
 * word BACK, and it never unlocks locked reports (use per-team Unlock for that).
 */
export type Transition = {
  from: EventPhase;
  to: EventPhase;
  /** needs the "I'm sure" tick */
  confirm: boolean;
  /** backwards move: needs the word BACK */
  back: boolean;
};

const FORWARD: [EventPhase, EventPhase, boolean][] = [
  ["waiting", "investigation", false],
  ["investigation", "initial_locked", true],
  ["initial_locked", "twist", true],
  ["twist", "final", false],
  ["twist", "closed", true],
  ["final", "closed", true],
  ["closed", "presentations", false],
  ["closed", "results", true],
  ["presentations", "results", true],
];

const BACKWARD: [EventPhase, EventPhase][] = [
  ["investigation", "waiting"],
  ["initial_locked", "investigation"],
  ["twist", "initial_locked"],
  ["final", "twist"],
  ["closed", "final"],
  ["presentations", "closed"],
  ["results", "presentations"],
];

export const TRANSITIONS: Transition[] = [
  ...FORWARD.map(([from, to, confirm]) => ({ from, to, confirm, back: false })),
  ...BACKWARD.map(([from, to]) => ({ from, to, confirm: true, back: true })),
];

export function findTransition(from: EventPhase, to: EventPhase): Transition | null {
  return TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null;
}

export function transitionsFrom(from: EventPhase): Transition[] {
  return TRANSITIONS.filter((t) => t.from === from);
}

/** Phases in which teams write (and the stage they write). */
export const WRITING_PHASES: EventPhase[] = ["investigation", "twist", "final"];

/** Phases in which judges may see their assigned teams (and the answer key). */
export const JUDGE_VIEW_PHASES: EventPhase[] = ["closed", "presentations", "results"];

/** Phases in which judges may enter or change scores. */
export const JUDGE_SCORE_PHASES: EventPhase[] = ["closed", "presentations"];

/** Phases in which judge assignment and the shortlist can be (re)made. */
export const JUDGING_ADMIN_PHASES: EventPhase[] = ["closed", "presentations"];

export type TransitionCheck = { ok: true; t: Transition } | { ok: false; reason: string };

/**
 * Validate a requested phase change. `facts` carries what the database says;
 * the caller turns a refusal reason into a message for the organiser.
 */
export function checkTransition(
  from: EventPhase,
  to: EventPhase,
  input: { confirmed: boolean; backWord: string },
  facts: { teamsWithoutCase: number; autoScores: number; shortlist: number },
): TransitionCheck {
  if (from === to) return { ok: false, reason: "already" };
  const t = findTransition(from, to);
  if (!t) return { ok: false, reason: "invalid" };
  if (t.back && input.backWord.trim().toUpperCase() !== "BACK") return { ok: false, reason: "needs-back" };
  if (!t.back && t.confirm && !input.confirmed) return { ok: false, reason: "needs-confirm" };
  if (to === "investigation" && !t.back && facts.teamsWithoutCase > 0 && !input.confirmed) return { ok: false, reason: "teams-without-case" };
  if (to === "presentations" && !t.back && facts.shortlist === 0) return { ok: false, reason: "no-shortlist" };
  if (to === "results" && !t.back && facts.autoScores === 0) return { ok: false, reason: "no-scores" };
  return { ok: true, t };
}
