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

export type EvidenceType = "log" | "chat" | "email" | "db" | "api" | "code" | "screenshot" | "ai_output" | "note";
export type EvidenceTag = "relevant" | "irrelevant" | "misleading";
export type Stage = "initial" | "final";

export type EvidenceRow = {
  id: string;
  case_id: string;
  code: string;
  type: EvidenceType;
  title: string;
  time_label: string | null;
  content: Record<string, unknown>;
  is_twist: boolean;
  sort_order: number;
};

export type TagRow = { evidence_id: string; tag: EvidenceTag | null; note: string };

export type TimelineEntry = {
  id?: string;
  position: number;
  evidence_id: string | null;
  time_label: string;
  description: string;
};

export type Submission = {
  team_id: string;
  stage: Stage;
  what_happened: string;
  root_cause_category: string | null;
  root_cause_md: string;
  responsible: string;
  key_evidence: string[];
  fix_md: string;
  tags_snapshot: Record<string, EvidenceTag> | null;
  submitted_at: string | null;
  locked: boolean;
  /** set by the official lock (admin), not by the team's own submission */
  admin_locked: boolean;
};
