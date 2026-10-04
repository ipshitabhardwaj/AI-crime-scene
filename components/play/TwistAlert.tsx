"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

/**
 * Full-screen notice shown once per device when the twist is released, so
 * teams answer the new questions BEFORE touching the Final Report.
 * `releasedAt` is part of the key, so a re-released twist shows it again.
 */
export default function TwistAlert({ teamCode, releasedAt, newQuestions }: { teamCode: string; releasedAt: string; newQuestions: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const key = `aif-twist-seen-${teamCode}-${releasedAt}`;

  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) {
        ref.current?.showModal();
        localStorage.setItem(key, "seen");
      }
    } catch {
      /* storage blocked: the banners on the page still explain it */
    }
  }, [key]);

  const close = () => ref.current?.close();
  const steps: [string, string][] = [
    ["Read the new evidence", "It is in the yellow box on the Case tab and above the questions."],
    [`Answer the ${newQuestions} new question${newQuestions === 1 ? "" : "s"}`, "They are marked “New” in the Questions tab."],
    ["Only then: Final Report", "Say who did it now. Submitting locks everything."],
  ];

  return (
    <dialog ref={ref} aria-label="New evidence released" className="m-auto w-[min(560px,calc(100vw-32px))] rounded-2xl border-2 border-danger bg-panel p-0 text-text backdrop:bg-black/80">
      <div className="p-6">
        <p className="stamp text-danger">New evidence</p>
        <h2 className="mt-3 text-2xl font-bold">Wait — do not submit your Final Report yet</h2>
        <p className="mt-2 text-muted">The twist is out. Do these three things in order:</p>
        <ol className="mt-4 space-y-3">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger font-mono text-sm font-bold text-ink">{i + 1}</span>
              <span>
                <b>{t}</b>
                <span className="block text-sm text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link prefetch={false} href="/play/questions" onClick={close} className="mt-6 block w-full rounded-lg bg-danger py-3 text-center text-lg font-bold text-ink hover:brightness-110">
          Show me the new clues →
        </Link>
      </div>
    </dialog>
  );
}
