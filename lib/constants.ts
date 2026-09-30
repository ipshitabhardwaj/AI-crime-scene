export type AppRole = "admin" | "judge" | "team";

export type EventPhase =
  | "waiting"
  | "investigation"
  | "initial_locked"
  | "twist"
  | "final"
  | "closed"
  | "presentations"
  | "results";

export const PHASES: { id: EventPhase; label: string; teamMessage: string }[] = [
  { id: "waiting", label: "Waiting", teamMessage: "The case opens soon. Stay logged in." },
  { id: "investigation", label: "Investigation", teamMessage: "Read and tag the evidence, build your timeline and submit your Initial Conclusion. You can keep investigating until the lock." },
  { id: "initial_locked", label: "Initial locked", teamMessage: "Round 1 is locked. Stand by for new evidence." },
  { id: "twist", label: "Twist", teamMessage: "New evidence released. Review it, update your timeline, then submit your Final Report." },
  { id: "final", label: "Final report", teamMessage: "Submit your Final Report before the timer ends." },
  { id: "closed", label: "Closed", teamMessage: "Submissions are closed. Judging in progress." },
  { id: "presentations", label: "Presentations", teamMessage: "Shortlisted teams are presenting." },
  { id: "results", label: "Results", teamMessage: "Results are out." },
];

export const phaseInfo = (p: EventPhase) => PHASES.find((x) => x.id === p) ?? PHASES[0];

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/admin",
  judge: "/judge",
  team: "/play",
};

/** Area prefix -> role allowed in it. */
export const PROTECTED_AREAS: { prefix: string; role: AppRole }[] = [
  { prefix: "/play", role: "team" },
  { prefix: "/admin", role: "admin" },
  { prefix: "/judge", role: "judge" },
];

export const TEAM_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_TEAM_EMAIL_DOMAIN ?? "teams.aifiles.local";

/** AIF-014 -> aif-014@teams.aifiles.local */
export function teamCodeToEmail(code: string) {
  return `${code.trim().toLowerCase()}@${TEAM_EMAIL_DOMAIN}`;
}

export function normaliseTeamCode(code: string) {
  return code.trim().toUpperCase();
}
