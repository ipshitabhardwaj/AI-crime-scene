import Link from "next/link";
import UploadCase from "@/components/admin/UploadCase";
import { deleteCase } from "@/app/actions/admin-cases";
import { getEvent } from "@/lib/event";
import { createClient } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

type Row = { id: string; code: string; title: string; evidence: { count: number }[]; teams: { count: number }[] };

export default async function CasesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("cases").select("id, code, title, evidence(count), teams(count)").order("code").returns<Row[]>();
  const cases = data ?? [];
  const event = await getEvent();
  const waiting = !event || event.phase === "waiting";

  return (
    <div className="space-y-6">
      <PageHeader kicker="Case files" title="Cases" description="Upload and preview the investigation cases. Teams are assigned cases round-robin on import." />
      <section className={ui.card}>
        <h2 className="mb-1 font-semibold">Upload a case file</h2>
        <p className="mb-4 text-sm text-muted">JSON in the format of <code>cases/examples/sample-case.json</code>. It is validated before anything is saved.</p>
        <UploadCase inProgress={!waiting} />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {cases.map((c) => (
          <div key={c.id} className={ui.card}>
            <p className="flex items-center gap-2 font-mono text-xs text-accent">{c.code}{c.code.includes("SAMPLE") && <span className="rounded bg-danger px-1.5 font-sans text-[10px] font-bold text-white">TEST</span>}</p>
            <p className="mt-1 font-semibold">{c.title}</p>
            {c.code.includes("SAMPLE") && <p className="mt-1 text-xs text-danger">Test case: delete before importing real teams.</p>}
            <p className="mt-1 text-sm text-muted">{c.evidence[0]?.count ?? 0} evidence items · {c.teams[0]?.count ?? 0} teams assigned</p>
            <div className="mt-3 flex items-center gap-2">
              <Link href={`/admin/cases/${c.id}`} className={ui.btnGhost}>Preview + answer key</Link>
              {waiting ? (
                <details className="ml-auto text-xs">
                  <summary className="cursor-pointer text-muted">Delete</summary>
                  <form action={deleteCase} className="mt-2 flex gap-1">
                    <input type="hidden" name="caseId" value={c.id} />
                    <input name="confirm" placeholder="DELETE" aria-label="Type DELETE to confirm" className={`${ui.input} w-24 py-1`} />
                    <button className={ui.btnDanger}>Delete case</button>
                  </form>
                </details>
              ) : (
                <span className="ml-auto text-xs text-muted">Locked during the event</span>
              )}
            </div>
          </div>
        ))}
        {cases.length === 0 && <p className="text-muted">No cases yet.</p>}
      </section>
    </div>
  );
}
