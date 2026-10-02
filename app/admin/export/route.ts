import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { selectAll } from "@/lib/db";
import { getLeaderboard } from "@/lib/results";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Quote for CSV and neutralise spreadsheet formulas (a team called "=HYPERLINK(...)"
// must not become a live formula when the organiser opens the file in Excel/Sheets).
const esc = (v: unknown) => {
  let s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Full results + submissions as CSV (open in Excel / Sheets). */
export async function GET() {
  const session = await getSession();
  if (session?.profile.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const db = createAdminClient();
  const board = await getLeaderboard(db);
  const [teams, subs] = await Promise.all([
    selectAll<{ id: string; members: { name: string }[]; contact_email: string | null; contact_phone: string | null }>((a, b) =>
      db.from("teams").select("id, members, contact_email, contact_phone").order("id").range(a, b),
    ),
    selectAll<Record<string, unknown> & { team_id: string; stage: string }>((a, b) => db.from("submissions").select("*").order("team_id").order("stage").range(a, b)),
  ]);

  const header = [
    "rank", "team_code", "team", "institution", "members", "email", "phone", "case",
    "auto_questions", "auto_twist_questions", "auto_initial_conclusion", "auto_final_report", "auto_total",
    "judge_culprit", "judge_reasoning", "judge_clues", "judge_presentation", "judge_total", "total", "shortlist_order",
    "initial_culprit", "initial_explanation", "initial_submitted_at", "final_culprit", "final_explanation", "final_submitted_at",
  ];
  const lines = [header.join(",")];
  for (const r of board) {
    const t = teams.find((x) => x.id === r.id);
    const i = subs.find((s) => s.team_id === r.id && s.stage === "initial");
    const f = subs.find((s) => s.team_id === r.id && s.stage === "final");
    lines.push(
      [
        r.rank, r.team_code, r.name, r.institution, (t?.members ?? []).map((m) => m.name), t?.contact_email, t?.contact_phone, r.case_code,
        r.auto?.tagging, r.auto?.timeline, r.auto?.hypothesis, r.auto?.root_cause, r.auto?.total,
        r.judge.responsible, r.judge.reasoning, r.judge.evidence_based, r.judge.presentation, r.judge.total, r.total, r.shortlist?.presentation_order,
        i?.root_cause_category, i?.what_happened, i?.submitted_at, f?.root_cause_category, f?.what_happened, f?.submitted_at,
      ].map(esc).join(","),
    );
  }

  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ai-files-results-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv"`,
    },
  });
}
