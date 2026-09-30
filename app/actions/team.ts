"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceTag, Stage, TimelineEntry } from "@/lib/types";

/**
 * Team actions. Each one is a single call to a database function
 * (migration 0003) that checks — as the logged-in team — that the phase is
 * open, the deadline has not passed, the stage is not yet submitted, the
 * evidence belongs to the team's case, and (for timeline/report) that nobody
 * else on the team saved a newer version in the meantime.
 *
 * Errors are returned, not thrown, so the UI can show them. A thrown error
 * therefore means the request itself failed (network), which the client retries.
 */
export type ActionResult =
  | { ok: true; version?: number; submittedAt?: string }
  | { ok: false; code: "CLOSED" | "CONFLICT" | "INVALID" | "AUTH" | "ERROR"; error: string };

const MESSAGES: Record<string, { code: Exclude<ActionResult, { ok: true }>["code"]; error: string }> = {
  CLOSED: { code: "CLOSED", error: "Editing is closed: the phase is over, time is up, or this part is already submitted." },
  CONFLICT: { code: "CONFLICT", error: "A teammate saved a newer version on another device." },
  INVALID_EVIDENCE: { code: "INVALID", error: "That evidence item is not part of your case." },
  INVALID_TIMELINE: { code: "INVALID", error: "The timeline could not be saved (max 60 steps)." },
  INVALID_REPORT: { code: "INVALID", error: "The report could not be saved." },
  NOT_TEAM: { code: "AUTH", error: "You are logged out. Log in again with your team code and PIN." },
};

function fail(message: string | undefined): ActionResult {
  const key = Object.keys(MESSAGES).find((k) => message?.includes(k));
  if (key) return { ok: false, ...MESSAGES[key] };
  if (message && /JWT|auth/i.test(message)) return { ok: false, ...MESSAGES.NOT_TEAM };
  return { ok: false, code: "ERROR", error: "Could not save. Please try again." };
}

export async function saveTag(evidenceId: string, tag: EvidenceTag | null, note: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_tag", { p_evidence: evidenceId, p_tag: tag, p_note: String(note ?? "").slice(0, 2000) });
  return error ? fail(error.message) : { ok: true };
}

/**
 * Read this team's current tag for one item (row security limits it to the
 * team's own rows). Used to show a teammate's change on another device.
 * Returns null when it could not be read.
 */
export async function readTag(evidenceId: string): Promise<{ tag: EvidenceTag | null; note: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("evidence_tags").select("tag, note").eq("evidence_id", evidenceId).maybeSingle<{ tag: EvidenceTag | null; note: string }>();
  if (error) return null;
  return { tag: data?.tag ?? null, note: data?.note ?? "" };
}

export async function saveTimeline(stage: Stage, entries: TimelineEntry[], baseVersion: number): Promise<ActionResult> {
  if (!Array.isArray(entries) || entries.length > 60) return { ok: false, ...MESSAGES.INVALID_TIMELINE };
  const supabase = await createClient();
  const payload = entries.map((e) => ({
    evidence_id: e.evidence_id || null,
    time_label: String(e.time_label ?? "").slice(0, 60),
    description: String(e.description ?? "").slice(0, 500),
  }));
  const { data, error } = await supabase.rpc("save_timeline", { p_stage: stage, p_entries: payload, p_base: baseVersion });
  return error ? fail(error.message) : { ok: true, version: data as number };
}

export type ReportFields = {
  what_happened: string;
  root_cause_category: string | null;
  root_cause_md: string;
  responsible: string;
  key_evidence: string[];
  fix_md: string;
};

function clean(f: ReportFields) {
  return {
    what_happened: String(f.what_happened ?? "").slice(0, 5000),
    root_cause_category: f.root_cause_category || null,
    root_cause_md: String(f.root_cause_md ?? "").slice(0, 5000),
    responsible: String(f.responsible ?? "").slice(0, 500),
    key_evidence: Array.isArray(f.key_evidence) ? f.key_evidence.map(String).slice(0, 50) : [],
    fix_md: String(f.fix_md ?? "").slice(0, 5000),
  };
}

export async function saveReport(stage: Stage, fields: ReportFields, baseVersion: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_report", { p_stage: stage, p_fields: clean(fields), p_base: baseVersion });
  return error ? fail(error.message) : { ok: true, version: data as number };
}

/** Save + lock. Idempotent: submitting twice returns the first submission time. */
export async function submitReport(stage: Stage, fields: ReportFields, baseVersion: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_report", { p_stage: stage, p_fields: clean(fields), p_base: baseVersion });
  if (error) return fail(error.message);
  revalidatePath("/play", "layout");
  return { ok: true, submittedAt: data as string };
}
