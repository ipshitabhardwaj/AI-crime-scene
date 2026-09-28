import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = { team_id: string; teams: { id: string; team_code: string; name: string; auto_scores: { total: number } | null; shortlist: { presentation_order: number | null } | null } | null };

export default async function JudgeHome() {
  const { userId } = await requireRole("judge");
  const supabase = await createClient();
  const [{ data }, { data: mine }] = await Promise.all([
    supabase
      .from("judge_assignments")
      .select("team_id, teams(id, team_code, name, auto_scores(total), shortlist(presentation_order))")
      .eq("judge_id", userId)
      .returns<Row[]>(),
    supabase.from("judge_scores").select("team_id, criterion").eq("judge_id", userId),
  ]);

  const teams = (data ?? [])
    .flatMap((a) => (a.teams ? [a.teams] : []))
    .sort((a, b) => (a.shortlist?.presentation_order ?? 999) - (b.shortlist?.presentation_order ?? 999) || a.team_code.localeCompare(b.team_code));
  const done = (id: string) => (mine ?? []).filter((s) => s.team_id === id).length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Your assigned teams</h1>
      {teams.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
          No teams assigned yet. Assignments are made after submissions close and auto-scoring runs.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {teams.map((t) => (
            <li key={t.id}>
              <Link href={`/judge/${t.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-panel">
                <span className="font-mono text-accent">{t.team_code}</span>
                <span className="font-medium">{t.name}</span>
                {t.shortlist && <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent">presents #{t.shortlist.presentation_order}</span>}
                <span className="ml-auto text-sm text-muted">auto {t.auto_scores?.total ?? "—"}/50</span>
                <span className={`text-sm ${done(t.id) ? "text-ok" : "text-muted"}`}>{done(t.id) ? `${done(t.id)} scored` : "not scored"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
