"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveReport, submitReport, type ReportFields } from "@/app/actions/team";
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
    !f.root_cause_category && "root cause category",
    !f.responsible.trim() && "responsible party",
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

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <SaveIndicator state={state} error={error} />
      </div>
      {state === "conflict" && <ConflictBanner onReload={() => router.refresh()} />}

      <label className="block">
        <span className={label}>What happened?</span>
        <span className={hint}>Reconstruct the incident in a few sentences.</span>
        <textarea rows={5} maxLength={5000} className={area} value={f.what_happened} disabled={!writable} onChange={(e) => set("what_happened", e.target.value)} />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={label}>Root cause category</span>
          <span className={hint}>Pick the closest one.</span>
          <select className={area} value={f.root_cause_category ?? ""} disabled={!writable} onChange={(e) => set("root_cause_category", e.target.value || null)}>
            <option value="">— choose —</option>
            {rootCauseOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={label}>Responsible component / person / system</span>
          <span className={hint}>As specific as the evidence allows.</span>
          <input name="responsible" maxLength={500} className={area} value={f.responsible} disabled={!writable} onChange={(e) => set("responsible", e.target.value)} />
        </label>
      </div>

      <label className="block">
        <span className={label}>Root cause explained</span>
        <span className={hint}>Why did it happen? Connect the clues and cite evidence codes (E03, T01…).</span>
        <textarea rows={5} maxLength={5000} className={area} value={f.root_cause_md} disabled={!writable} onChange={(e) => set("root_cause_md", e.target.value)} />
      </label>

      <fieldset>
        <legend className={label}>Key evidence</legend>
        <span className={hint}>Select the items that prove your conclusion.</span>
        <div className="flex flex-wrap gap-2">
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
                className={`rounded-full border px-3 py-1 font-mono text-xs disabled:opacity-60 ${on ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-text"}`}
              >
                {e.code}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block">
        <span className={label}>Recommended fix / prevention</span>
        <span className={hint}>{stage === "initial" ? "Optional now, expected in the final report." : "What should change so this never happens again?"}</span>
        <textarea rows={4} maxLength={5000} className={area} value={f.fix_md} disabled={!writable} onChange={(e) => set("fix_md", e.target.value)} />
      </label>

      {writable && (
        <div className="rounded-xl border border-line bg-panel p-4" aria-live="polite">
          {submit.kind === "idle" || submit.kind === "error" ? (
            <button type="button" onClick={() => setSubmit({ kind: "confirming" })} className="rounded-md bg-accent px-5 py-2.5 font-semibold text-ink">
              Submit {stage === "initial" ? "initial conclusion" : "final report"}
            </button>
          ) : submit.kind === "confirming" ? (
            <div className="space-y-3">
              {missing.length > 0 && <p className="text-sm text-accent">Still empty: {missing.join(", ")}. You can submit anyway.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">After submitting, this report, your timeline and your tags are locked until the next phase.</span>
                <button type="button" onClick={doSubmit} className="rounded-md bg-danger px-4 py-2 font-semibold text-white">
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
              <div className="flex gap-3">
                <button type="button" onClick={doSubmit} className="rounded-md bg-accent px-4 py-2 font-semibold text-ink">Try again</button>
                <button type="button" onClick={() => router.refresh()} className="rounded-md border border-line px-4 py-2">Check status</button>
              </div>
            </div>
          )}
          {submit.kind === "error" && <p className="mt-2 text-sm text-danger" role="alert">{submit.message}</p>}
          <p className="mt-2 text-xs text-muted">Not submitted when time runs out? Your saved draft is locked and marked “auto-locked”. It is still scored.</p>
        </div>
      )}
    </div>
  );
}
