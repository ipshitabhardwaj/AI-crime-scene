import PrintButton from "@/components/admin/PrintButton";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = { id: string; team_code: string; name: string; cases: { code: string } | null; team_credentials: { pin: string } | null };

export default async function SlipsPage({ searchParams }: { searchParams: Promise<{ dummy?: string }> }) {
  const { dummy } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("teams").select("id, team_code, name, cases(code), team_credentials(pin)").order("team_code");
  if (dummy !== "1") query = query.eq("is_dummy", false);
  const { data } = await query.returns<Row[]>();
  const teams = data ?? [];
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 print:hidden">
        <h1 className="text-xl font-bold">Credential slips ({teams.length})</h1>
        <a href={dummy === "1" ? "/admin/teams/slips" : "/admin/teams/slips?dummy=1"} className="text-sm text-muted underline">
          {dummy === "1" ? "Hide dummy teams" : "Include dummy teams"}
        </a>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-3 print:gap-0 md:grid-cols-3">
        {teams.map((t) => (
          <div key={t.id} className="break-inside-avoid rounded-lg border border-dashed border-line p-4 print:rounded-none print:border-black print:text-black">
            <p className="text-xs uppercase tracking-widest">The AI Files · Decode the Crime</p>
            <p className="mt-1 text-lg font-bold">{t.name}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono">
              <div><p className="text-[10px] uppercase">Team code</p><p className="text-xl font-bold">{t.team_code}</p></div>
              <div><p className="text-[10px] uppercase">PIN</p><p className="text-xl font-bold">{t.team_credentials?.pin ?? "—"}</p></div>
            </div>
            <p className="mt-2 text-xs">Log in at {site || "the event URL"} → Team tab. Keep this slip private.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
