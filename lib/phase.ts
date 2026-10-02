import type { EventPhase } from "./constants";
import type { Stage } from "./types";

/** Which stage teams are working on in this phase (null = no writing). */
export function openStage(phase: EventPhase | undefined | null): Stage | null {
  if (phase === "investigation") return "initial";
  if (phase === "twist" || phase === "final") return "final";
  return null;
}

/**
 * Minutes added to a team's current deadline: the whole-event extension plus
 * the extension given for the phase that is running now (same rule as the
 * database function team_extra_minutes, migration 0004).
 */
export function effectiveExtraMinutes(
  team: { extra_minutes: number; phase_extra_minutes?: number | null; phase_extra_phase?: EventPhase | null } | null | undefined,
  phase: EventPhase | null | undefined,
): number {
  if (!team) return 0;
  const phaseExtra = team.phase_extra_phase && team.phase_extra_phase === phase ? (team.phase_extra_minutes ?? 0) : 0;
  return (team.extra_minutes ?? 0) + phaseExtra;
}

/** Deadline (ms) for a team, including its extension. null = no deadline. */
export function teamDeadline(phaseEndsAt: string | null | undefined, extraMinutes: number): number | null {
  if (!phaseEndsAt) return null;
  return new Date(phaseEndsAt).getTime() + extraMinutes * 60_000;
}
