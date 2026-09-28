"use client";

import { useState } from "react";
import { saveTag } from "@/app/actions/team";
import { TAG_HELP, TAG_STYLES } from "@/lib/phase";
import type { EvidenceTag } from "@/lib/types";
import { SaveIndicator, useAutosave } from "./useAutosave";

export default function TagPanel({
  evidenceId,
  initialTag,
  initialNote,
  writable,
  closedReason,
}: {
  evidenceId: string;
  initialTag: EvidenceTag | null;
  initialNote: string;
  writable: boolean;
  closedReason: string;
}) {
  const [value, setValue] = useState({ tag: initialTag, note: initialNote });
  const { state, error } = useAutosave(value, (v) => saveTag(evidenceId, v.tag, v.note), writable, 700);

  return (
    <aside className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Your assessment</h2>
        <SaveIndicator state={state} error={error} />
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Classify this evidence">
        {(["relevant", "irrelevant", "misleading"] as const).map((t) => {
          const active = value.tag === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!writable}
              title={TAG_HELP[t]}
              onClick={() => setValue((v) => ({ ...v, tag: active ? null : t }))}
              className={`rounded-md border px-2 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                active ? TAG_STYLES[t].cls : "border-line text-muted hover:text-text"
              }`}
            >
              {TAG_STYLES[t].label}
            </button>
          );
        })}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">What do these mean?</summary>
        <ul className="mt-2 space-y-1">
          {(["relevant", "misleading", "irrelevant"] as const).map((t) => (
            <li key={t}>
              <b className="text-text">{TAG_STYLES[t].label}:</b> {TAG_HELP[t]}
            </li>
          ))}
        </ul>
      </details>
      <label className="mt-4 block">
        <span className="mb-1 block text-sm text-muted">Notes (why it matters, what it connects to)</span>
        <textarea
          value={value.note}
          disabled={!writable}
          maxLength={2000}
          onChange={(e) => setValue((v) => ({ ...v, note: e.target.value }))}
          rows={6}
          className="w-full rounded-md border border-line bg-ink p-3 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
          placeholder="e.g. Same time as E07, so this is what set it off. Contradicts E02."
        />
      </label>
      {!writable && <p className="mt-2 text-xs text-muted">{closedReason}</p>}
    </aside>
  );
}
