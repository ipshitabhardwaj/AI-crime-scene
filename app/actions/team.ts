"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { choiceToLetter, letterToChoice } from "@/lib/scoring";
import type { Stage } from "@/lib/types";

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
  INVALID_EVIDENCE: { code: "INVALID", error: "That question is not part of your case." },
  INVALID_REPORT: { code: "INVALID", error: "The report could not be saved." },
  NOT_TEAM: { code: "AUTH", error: "You are logged out. Log in again with your team code and PIN." },
};

function fail(message: string | undefined): ActionResult {
  const key = Object.keys(MESSAGES).find((k) => message?.includes(k));
  if (key) return { ok: false, ...MESSAGES[key] };
  if (message && /JWT|auth/i.test(message)) return { ok: false, ...MESSAGES.NOT_TEAM };
  return { ok: false, code: "ERROR", error: "Could not save. Please try again." };
}

/**
 * Save the team's answer to one question (choice 1–4).
 * Stored through save_tag: the answer letter goes into the note, the tag is a
 * fixed marker meaning "answered" (see lib/cases/load.ts for the mapping).
 * Round-1 answers cannot be changed once the twist is out.
 */
export async function saveAnswer(questionId: string, choice: number): Promise<ActionResult> {
  const letter = choiceToLetter(Number(choice));
  if (!letter) return { ok: false, code: "INVALID", error: "Pick one of the four options." };
  const supabase = await createClient();
  const [{ data: q }, { data: ev }] = await Promise.all([
    supabase.from("evidence").select("is_twist").eq("id", questionId).maybeSingle<{ is_twist: boolean }>(),
    supabase.from("event").select("phase").eq("id", 1).maybeSingle<{ phase: string }>(),
  ]);
  if (!q) return { ok: false, ...MESSAGES.INVALID_EVIDENCE };
  if (!q.is_twist && ev?.phase !== "investigation") return { ok: false, ...MESSAGES.CLOSED };
  const { error } = await supabase.rpc("save_tag", { p_evidence: questionId, p_tag: "relevant", p_note: letter });
  return error ? fail(error.message) : { ok: true };
}

/**
 * The team's current answers, { questionId: choice }. Row security limits it
 * to the team's own rows. Used to show a teammate's answers on another device.
 * Returns null when it could not be read.
 */
export async function readAnswers(): Promise<Record<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("evidence_tags").select("evidence_id, note").returns<{ evidence_id: string; note: string }[]>();
  if (error) return null;
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    const c = letterToChoice(r.note);
    if (c) out[r.evidence_id] = c;
  }
  return out;
}

/** The short report: who did it, and why the team thinks so. */
export type ReportFields = { culprit: string | null; explanation: string };

/** Database columns: culprit → root_cause_category, explanation → what_happened. */
function clean(f: ReportFields) {
  return {
    what_happened: String(f.explanation ?? "").slice(0, 5000),
    root_cause_category: f.culprit || null,
    root_cause_md: "",
    responsible: "",
    key_evidence: [],
    fix_md: "",
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
