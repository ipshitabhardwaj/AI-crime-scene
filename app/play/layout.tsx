import AppHeader from "@/components/AppHeader";
import PhaseBanner from "@/components/PhaseBanner";
import { requireRole } from "@/lib/auth";
import { getEvent } from "@/lib/event";
import { effectiveExtraMinutes } from "@/lib/phase";

export const dynamic = "force-dynamic";

export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("team");
  const event = await getEvent();
  const team = session.team;

  return (
    <div className="min-h-screen">
      <AppHeader area="Case file" who={team ? `${team.team_code} · ${team.name}` : "Team"} />
      <div className="sticky top-0 z-10">
        <PhaseBanner initial={event} extraMinutes={effectiveExtraMinutes(team, event?.phase)} />
      </div>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
