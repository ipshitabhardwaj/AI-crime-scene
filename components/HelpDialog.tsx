"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * "How to play / How to run the event" guide. Opens by itself on the first
 * visit in this browser (remembered in localStorage), and any time from the
 * ? button.
 */
export default function HelpDialog({ label, title, storageKey, children }: { label: string; title: string; storageKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) {
        ref.current?.showModal();
        localStorage.setItem(storageKey, "seen");
      }
    } catch {
      /* storage blocked: just don't auto-open */
    }
  }, [storageKey]);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-text"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-bold">?</span>
        {label}
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        className="m-auto w-[min(640px,calc(100vw-32px))] rounded-2xl border border-line bg-panel p-0 text-text backdrop:bg-black/70"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="max-h-[80vh] overflow-y-auto p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold">{title}</h2>
            <button type="button" onClick={() => ref.current?.close()} className="text-muted hover:text-text" aria-label="Close help">
              ✕
            </button>
          </div>
          <div className="space-y-4 text-sm leading-relaxed">{children}</div>
          <button type="button" onClick={() => ref.current?.close()} className="mt-6 w-full rounded-lg bg-accent py-2.5 font-semibold text-ink hover:brightness-110">
            Got it
          </button>
        </div>
      </dialog>
    </>
  );
}

/** Numbered list used inside the help dialogs. */
export function HelpSteps({ steps }: { steps: [string, string][] }) {
  return (
    <ol className="space-y-3">
      {steps.map(([t, d], i) => (
        <li key={t} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-ink">{i + 1}</span>
          <span>
            <b>{t}</b>
            <span className="block text-muted">{d}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
