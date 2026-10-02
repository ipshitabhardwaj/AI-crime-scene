import type { AppRole, EventPhase } from "./constants";

export type EventRow = {
  id: number;
  name: string;
  phase: EventPhase;
  phase_ends_at: string | null;
  twist_released_at: string | null;
  updated_at: string;
};

export type Profile = {
  user_id: string;
  role: AppRole;
  team_id: string | null;
  display_name: string | null;
};

export type Team = {
  id: string;
  team_code: string;
  name: string;
  institution: string | null;
  members: { name: string; email?: string; phone?: string }[];
  contact_email: string | null;
  contact_phone: string | null;
  case_id: string | null;
  auth_user_id: string | null;
  checked_in: boolean;
  /** whole-event extension (applies to every remaining deadline) */
  extra_minutes: number;
  /** extension for one phase only (phase_extra_phase) */
  phase_extra_minutes: number;
  phase_extra_phase: EventPhase | null;
  is_dummy: boolean;
};

export type CaseRow = {
  id: string;
  code: string;
  title: string;
  briefing_md: string;
  root_cause_options: string[];
};

export type Stage = "initial" | "final";

/** A question row as stored in the `evidence` table (see lib/cases/load.ts). */
export type EvidenceRow = {
  id: string;
  case_id: string;
  code: string;
  title: string;
  content: { clue_label?: string; clue_title?: string; clue_text?: string; options?: string[] };
  is_twist: boolean;
  sort_order: number;
};

/** One multiple-choice question as the pages use it. */
export type Question = {
  id: string;
  code: string;
  question: string;
  clue: { label: string; title: string; text: string };
  options: string[];
  twist: boolean;
};

export function toQuestion(e: EvidenceRow): Question {
  return {
    id: e.id,
    code: e.code,
    question: e.title,
    clue: { label: e.content.clue_label ?? "Clue", title: e.content.clue_title ?? "", text: e.content.clue_text ?? "" },
    options: Array.isArray(e.content.options) ? e.content.options : [],
    twist: e.is_twist,
  };
}

export type Submission = {
  team_id: string;
  stage: Stage;
  what_happened: string;
  root_cause_category: string | null;
  root_cause_md: string;
  responsible: string;
  key_evidence: string[];
  fix_md: string;
  submitted_at: string | null;
  locked: boolean;
  /** set by the official lock (admin), not by the team's own submission */
  admin_locked: boolean;
};
