import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getEvent } from "@/lib/event";
import { JUDGE_VIEW_PHASES } from "@/lib/state-machine";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, Pill, Progress } from "@/components/ui";
import { JUDGE_CRITERIA } from "@/lib/scoring";

export const dynamic = "force-dynamic";

type Row = { team_id: string; teams: { id: string; team_code: string; name: string; auto_scores: { total: number } | null; shortlist: { presentation_order: number | null } | null } | null };

export default async function JudgeHome() {
  const { userId } = await requireRole("judge");
  const supabase = await createClient();
  const event = await getEvent();
  if (!event || !JUDGE_VIEW_PHASES.includes(event.phase)) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Judging" title="Your assigned teams" />
        <EmptyState title="Judging opens at Close">Your assigned teams, their work and the answer keys appear here when submissions close. This page doesn’t refresh on its own — reload it then.</EmptyState>
      </div>
    );
  }
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

  const full = (t: (typeof teams)[number]) => JUDGE_CRITERIA.filter((c) => c.id !== "presentation" || t.shortlist).length;
  const complete = teams.filter((t) => done(t.id) >= full(t)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Judging"
        title="Your assigned teams"
        description="Open a team, read its reports next to the answer key, and score each criterion from 0 to 10. “Save & next team” moves down the list."
      />
      {teams.length > 0 && (
        <div className="space-y-1 rounded-xl border border-line bg-panel p-4">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span className="font-mono">
              {complete}/{teams.length} teams fully scored
            </span>
          </div>
          <Progress value={complete} max={teams.length} tone={complete === teams.length ? "ok" : "accent"} label="Teams scored" />
        </div>
      )}
      {teams.length === 0 ? (
        <EmptyState title="No teams assigned yet">Assignments are made after submissions close and auto-scoring runs. Reload this page when the organisers say so.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {teams.map((t, i) => {
            const d = done(t.id);
            const f = full(t);
            return (
              <li key={t.id}>
                <Link href={`/judge/${t.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-panel2">
                  <span className="w-6 text-right font-mono text-xs text-muted">{i + 1}</span>
                  <span className="font-mono text-accent">{t.team_code}</span>
                  <span className="font-medium">{t.name}</span>
                  {t.shortlist && <Pill tone="accent">presents #{t.shortlist.presentation_order}</Pill>}
                  <span className="ml-auto text-sm text-muted">auto {t.auto_scores?.total ?? "—"}/50</span>
                  {d >= f ? <Pill tone="ok">✓ scored</Pill> : d > 0 ? <Pill tone="accent">{d}/{f} scored</Pill> : <Pill>not scored</Pill>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
