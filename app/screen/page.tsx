import ScreenView, { type ScreenBoard } from "@/components/ScreenView";
import { getEvent } from "@/lib/event";
import { getLeaderboard } from "@/lib/results";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Public projector page. No login. Reads the event row; during
 * presentations/results it also shows team names + totals (nothing else).
 */
export default async function ScreenPage() {
  const event = await getEvent();
  let board: ScreenBoard = [];
  if (event && (event.phase === "presentations" || event.phase === "results")) {
    const rows = await getLeaderboard(createAdminClient());
    const real = rows.filter((r) => !r.is_dummy);
    const use = real.length ? real : rows;
    board =
      event.phase === "presentations"
        ? use.filter((r) => r.shortlist).sort((a, b) => (a.shortlist!.presentation_order ?? 0) - (b.shortlist!.presentation_order ?? 0))
            .map((r) => ({ rank: r.shortlist!.presentation_order ?? 0, name: r.name, institution: r.institution, total: null }))
        : use.slice(0, 10).map((r, i) => ({ rank: i + 1, name: r.name, institution: r.institution, total: r.total }));
  }
  return <ScreenView initial={event} board={board} />;
}
