"use client";

import { useRef, useState } from "react";
import Link from "next/link";
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

/** The short report: pick the culprit, explain why, submit. */
export default function ReportForm({
  stage,
  initial,
  suspects,
  writable,
  version,
  unanswered,
}: {
  stage: Stage;
  initial: ReportFields;
  suspects: string[];
  writable: boolean;
  version: number;
  unanswered: number;
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
  const name = stage === "initial" ? "Initial Conclusion" : "Final Report";

  // After the twist, the new questions come first: the big button leads there
  // and submitting needs a deliberate second choice. (Not a hard block, so a
  // team that is out of time can still hand in.)
  const gate = stage === "final" && unanswered > 0;
  const [skipGate, setSkipGate] = useState(false);

  const missing = [!f.culprit && "who did it", !f.explanation.trim() && "your explanation"].filter(Boolean) as string[];

  const doSubmit = async () => {
    setSubmit({ kind: "sending" });
    try {
      await flush(); // make sure the latest draft is saved first
      const r = await submitReport(stage, f, versionRef.current);
      if (r.ok) {
        router.refresh();
        return; // page re-renders as "Submitted"
      }
      setSubmit({ kind: "error", message: r.code === "CONFLICT" ? "A teammate changed this on another device. Reload, check it, then submit." : r.error });
    } catch {
      setSubmit({ kind: "unknown" });
    }
  };

  const box = "rounded-xl border border-line bg-panel p-5";
  return (
    <div className="space-y-4">
      {state === "conflict" && <ConflictBanner onReload={() => router.refresh()} />}

      <fieldset className={box}>
        <legend className="sr-only">Who did it?</legend>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">1 · Who did it?</h2>
          <SaveIndicator state={state} error={error} />
        </div>
        <p className="mt-1 text-sm text-muted">Pick one suspect.</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Who did it?">
          {suspects.map((s) => {
            const on = f.culprit === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!writable}
                onClick={() => setF((x) => ({ ...x, culprit: s }))}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left disabled:cursor-not-allowed ${on ? "border-accent bg-accent/20" : "border-line bg-ink hover:border-accent/70 disabled:opacity-60 disabled:hover:border-line"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-accent" : "border-line"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}</span>
                <span className="font-medium">{s}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className={box}>
        <label className="block">
          <span className="type text-xl font-bold">2 · How do you know?</span>
          <span className="mt-1 block text-sm text-muted">Two to four sentences. What happened, and which clues prove it?</span>
          <textarea
            rows={5}
            maxLength={2000}
            aria-label="How do you know?"
            className="mt-3 w-full rounded-md border border-line bg-ink p-3 text-base focus:border-accent focus:outline-none disabled:opacity-60"
            value={f.explanation}
            disabled={!writable}
            placeholder="e.g. We think it was … because the CCTV clue shows … and the payment record shows …"
            onChange={(e) => setF((x) => ({ ...x, explanation: e.target.value }))}
          />
        </label>
      </div>

      {writable ? (
        <div className={`${box} space-y-3`} aria-live="polite">
          {(submit.kind === "idle" || submit.kind === "error") && gate && !skipGate ? (
            <div className="rounded-lg border-2 border-danger/70 bg-danger/10 p-4">
              <p className="text-lg font-bold text-danger">
                Not yet — you have {unanswered} new question{unanswered === 1 ? "" : "s"} to answer first.
              </p>
              <p className="mt-1 text-sm">The new evidence may change who did it. Answer the new questions, then come back here for your Final Report.</p>
              <Link prefetch={false} href="/play/questions" className="mt-3 block w-full rounded-lg bg-danger px-5 py-3 text-center text-lg font-bold text-ink hover:brightness-110">
                Answer the new questions →
              </Link>
              <button type="button" onClick={() => setSkipGate(true)} className="mt-3 text-xs text-muted underline hover:text-text">
                Submit without answering them (they will score 0)
              </button>
            </div>
          ) : submit.kind === "idle" || submit.kind === "error" ? (
            <>
              {unanswered > 0 && (
                <p className="text-sm text-danger">
                  You still have {unanswered} unanswered question{unanswered === 1 ? "" : "s"} in the Questions tab.
                </p>
              )}
              <button type="button" onClick={() => setSubmit({ kind: "confirming" })} className="w-full rounded-lg bg-accent px-5 py-3 text-lg font-bold text-white hover:brightness-110">
                Submit {name}
              </button>
            </>
          ) : submit.kind === "confirming" ? (
            <div className="space-y-3">
              {missing.length > 0 && <p className="text-sm text-danger">Still empty: {missing.join(" and ")}. You can submit anyway.</p>}
              {gate && (
                <p className="text-sm font-semibold text-danger">
                  {unanswered} new question{unanswered === 1 ? " is" : "s are"} still unanswered and will score 0.
                </p>
              )}
              <p>
                {stage === "initial"
                  ? "Your Initial Conclusion will be recorded and cannot be changed. You can still change your question answers until the organisers lock round 1."
                  : "After submitting, your Final Report and all your answers are locked."}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={doSubmit} className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-bold text-white">
                  Yes, submit
                </button>
                <button type="button" onClick={() => setSubmit({ kind: "idle" })} className="rounded-lg border border-line px-4 py-2.5">
                  Cancel
                </button>
              </div>
            </div>
          ) : submit.kind === "sending" ? (
            <p>Submitting… keep this page open.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-danger">We couldn’t confirm your submission (network problem).</p>
              <p>It may or may not have arrived. Submitting again is safe: it will never create a duplicate.</p>
              <div className="flex gap-2">
                <button type="button" onClick={doSubmit} className="rounded-lg bg-accent px-4 py-2 font-semibold text-white">Try again</button>
                <button type="button" onClick={() => router.refresh()} className="rounded-lg border border-line px-4 py-2">Check status</button>
              </div>
            </div>
          )}
          {submit.kind === "error" && <p className="text-sm text-danger" role="alert">{submit.message}</p>}
          <p className="text-xs text-muted">Not submitted when time runs out? Your saved draft is locked as it is and still scored.</p>
        </div>
      ) : (
        <p className="rounded-md border border-line bg-panel p-3 text-sm text-muted">🔒 This page is read-only.</p>
      )}
    </div>
  );
}
