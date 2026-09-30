"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveReport, submitReport, type ReportFields } from "@/app/actions/team";
import { ROOT_CAUSE_HELP, ROOT_CAUSE_RULE } from "@/lib/root-causes";
import type { Stage } from "@/lib/types";
import { ConflictBanner, SaveIndicator, useAutosave } from "./useAutosave";

type SubmitState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "sending" }
  | { kind: "unknown" } // network failed: we don't know if it arrived
  | { kind: "error"; message: string };

export default function ReportForm({
  stage,
  initial,
  rootCauseOptions,
  evidenceCodes,
  writable,
  version,
}: {
  stage: Stage;
  initial: ReportFields;
  rootCauseOptions: string[];
  evidenceCodes: { code: string; title: string }[];
  writable: boolean;
  version: number;
}) {
  const [f, setF] = useState<ReportFields>(initial);
  const versionRef = useRef(version);
  const { state, error, flush } = useAutosave(
    f,
    async (v) => {
      const r = await saveReport(stage, v, versionRef.current);
      if (r.ok && r.version !== undefined) versionRef.current = r.version;
      return r;
    },
    writable,
  );
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const router = useRouter();

  const set = <K extends keyof ReportFields>(k: K, v: ReportFields[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleCode = (code: string) =>
    set("key_evidence", f.key_evidence.includes(code) ? f.key_evidence.filter((c) => c !== code) : [...f.key_evidence, code]);

  const area = "w-full rounded-md border border-line bg-ink p-3 text-sm focus:border-accent focus:outline-none disabled:opacity-60";
  const label = "mb-1 block text-sm font-medium";
  const hint = "mb-2 block text-xs text-muted";
  const missing = [
    !f.what_happened.trim() && "what happened",
    !f.root_cause_category && "type of cause",
    !f.responsible.trim() && "who or what caused it",
  ].filter(Boolean) as string[];

  const doSubmit = async () => {
    setSubmit({ kind: "sending" });
    try {
      await flush(); // make sure the latest draft is saved first
      const r = await submitReport(stage, f, versionRef.current);
      if (r.ok) {
        router.refresh();
        return; // page re-renders as "Submitted"
      }
      setSubmit({ kind: "error", message: r.code === "CONFLICT" ? "A teammate changed the report on another device. Reload, check it, then submit." : r.error });
    } catch {
      setSubmit({ kind: "unknown" });
    }
  };

  const checks = [
    { ok: !!f.what_happened.trim(), label: "What happened" },
    { ok: !!f.root_cause_category, label: "Type of cause" },
    { ok: !!f.responsible.trim(), label: "Who or what caused it" },
    { ok: !!f.root_cause_md.trim(), label: "Why it happened" },
    { ok: f.key_evidence.length >= 3, label: "3+ pieces of evidence" },
  ];
  const n = (i: number, title: string) => (
    <span className="mb-2 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line font-mono text-xs text-muted">{i}</span>
      <span className="font-semibold">{title}</span>
    </span>
  );
  const box = "rounded-xl border border-line bg-panel p-4";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-4">
        {state === "conflict" && <ConflictBanner onReload={() => router.refresh()} />}

        <div className={box}>
          {n(1, "What happened")}
          <label className="block">
            <span className={label}>What happened?</span>
            <span className={hint}>Tell the story in a few sentences: what went wrong, and in what order?</span>
            <textarea rows={5} maxLength={5000} className={area} value={f.what_happened} disabled={!writable} onChange={(e) => set("what_happened", e.target.value)} />
          </label>
        </div>

        <div className={box}>
          {n(2, "The cause")}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={label}>Type of cause</span>
              <span className={hint}>Pick the closest one (see “What do these mean?”).</span>
              <select aria-label="Type of cause" className={area} value={f.root_cause_category ?? ""} disabled={!writable} onChange={(e) => set("root_cause_category", e.target.value || null)}>
                <option value="">— choose —</option>
                {rootCauseOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer">What do these mean?</summary>
                <p className="mt-1">{ROOT_CAUSE_RULE}</p>
                <dl className="mt-1 space-y-1">
                  {rootCauseOptions.map((o) => (
                    <div key={o}>
                      <dt className="font-semibold text-text">{o}</dt>
                      <dd>{ROOT_CAUSE_HELP[o] ?? ""}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </label>
            <label className="block">
              <span className={label}>Who or what caused it?</span>
              <span className={hint}>A person, a team, a program or a setting. Be as specific as the evidence allows.</span>
              <input name="responsible" maxLength={500} className={area} value={f.responsible} disabled={!writable} onChange={(e) => set("responsible", e.target.value)} />
            </label>
          </div>
          <label className="mt-4 block">
            <span className={label}>Why did it happen?</span>
            <span className={hint}>Connect the clues. Mention the evidence codes you rely on (like E03).</span>
            <textarea rows={5} maxLength={5000} className={area} value={f.root_cause_md} disabled={!writable} onChange={(e) => set("root_cause_md", e.target.value)} />
          </label>
        </div>

        <fieldset className={box}>
          <legend className="sr-only">Evidence that proves it</legend>
          {n(3, "Evidence that proves it")}
          <span className={hint}>Tick the items that prove your answer. Evidence from before the twist counts most; misleading or irrelevant items count against you.</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {evidenceCodes.map((e) => {
              const on = f.key_evidence.includes(e.code);
              return (
                <button
                  key={e.code}
                  type="button"
                  title={e.title}
                  aria-pressed={on}
                  disabled={!writable}
                  onClick={() => toggleCode(e.code)}
                  aria-label={`${e.code} — ${e.title}`}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-60 ${on ? "border-accent bg-accent/15 text-text" : "border-line text-muted hover:text-text"}`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? "border-accent bg-accent text-ink" : "border-line"}`}>{on ? "✓" : ""}</span>
                  <span>
                    <b className="font-mono text-accent">{e.code}</b> — {e.title}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">{f.key_evidence.length} selected{f.key_evidence.length ? `: ${f.key_evidence.join(", ")}` : ""}</p>
        </fieldset>

        <div className={box}>
          {n(4, "How to prevent it")}
          <label className="block">
            <span className={label}>How do we stop this happening again?</span>
            <span className={hint}>{stage === "initial" ? "Optional now, expected in the Final Report." : "What should change so this never happens again?"}</span>
            <textarea rows={4} maxLength={5000} className={area} value={f.fix_md} disabled={!writable} onChange={(e) => set("fix_md", e.target.value)} />
          </label>
        </div>
      </div>

      <aside className="h-fit space-y-4 rounded-xl border border-line bg-panel p-4 lg:sticky lg:top-16" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{stage === "initial" ? "Your Initial Conclusion" : "Your Final Report"}</h2>
          <SaveIndicator state={state} error={error} />
        </div>
        <ul className="space-y-1.5 text-sm">
          {checks.map((c) => (
            <li key={c.label} className={`flex items-center gap-2 ${c.ok ? "" : "text-muted"}`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${c.ok ? "bg-ok text-ink" : "border border-line"}`}>{c.ok ? "✓" : ""}</span>
              {c.label}
            </li>
          ))}
        </ul>

        {writable ? (
          <div className="space-y-3 border-t border-line pt-4">
            {submit.kind === "idle" || submit.kind === "error" ? (
              <button type="button" onClick={() => setSubmit({ kind: "confirming" })} className="w-full rounded-md bg-accent px-5 py-2.5 font-semibold text-ink hover:brightness-110">
                Submit {stage === "initial" ? "Initial Conclusion" : "Final Report"}
              </button>
            ) : submit.kind === "confirming" ? (
              <div className="space-y-3">
                {missing.length > 0 && <p className="text-sm text-accent">Still empty: {missing.join(", ")}. You can submit anyway.</p>}
                <p className="text-sm">
                  {stage === "initial"
                    ? "Your Initial Conclusion is recorded and cannot be changed. You can keep tagging evidence and editing your timeline until the organisers lock round 1."
                    : "After submitting, your Final Report, timeline and tags are locked."}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={doSubmit} className="flex-1 rounded-md bg-danger px-4 py-2 font-semibold text-white">
                    Yes, submit
                  </button>
                  <button type="button" onClick={() => setSubmit({ kind: "idle" })} className="rounded-md border border-line px-4 py-2">
                    Cancel
                  </button>
                </div>
              </div>
            ) : submit.kind === "sending" ? (
              <p className="text-sm">Submitting… keep this page open.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-accent">We couldn’t confirm your submission (network problem).</p>
                <p>It may or may not have arrived. Submitting again is safe: it will never create a duplicate.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={doSubmit} className="rounded-md bg-accent px-4 py-2 font-semibold text-ink">Try again</button>
                  <button type="button" onClick={() => router.refresh()} className="rounded-md border border-line px-4 py-2">Check status</button>
                </div>
              </div>
            )}
            {submit.kind === "error" && <p className="text-sm text-danger" role="alert">{submit.message}</p>}
            <p className="text-xs text-muted">Not submitted when time runs out? Your saved draft is locked and marked “auto-locked”. It is still scored.</p>
          </div>
        ) : (
          <p className="rounded-md border border-line bg-ink p-2 text-xs text-muted">🔒 This page is read-only.</p>
        )}
      </aside>
    </div>
  );
}
