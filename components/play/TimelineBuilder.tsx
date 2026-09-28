"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTimeline } from "@/app/actions/team";
import type { Stage, TimelineEntry } from "@/lib/types";
import { ConflictBanner, SaveIndicator, useAutosave } from "./useAutosave";

type EvidenceOption = { id: string; code: string; title: string; time_label: string | null };

const newEntry = (): TimelineEntry => ({ position: 0, evidence_id: null, time_label: "", description: "" });

export default function TimelineBuilder({
  stage,
  initialEntries,
  evidence,
  writable,
  version,
}: {
  stage: Stage;
  initialEntries: TimelineEntry[];
  evidence: EvidenceOption[];
  writable: boolean;
  version: number;
}) {
  const [entries, setEntries] = useState<TimelineEntry[]>(initialEntries);
  const versionRef = useRef(version);
  const router = useRouter();
  const { state, error } = useAutosave(
    entries,
    async (v) => {
      const r = await saveTimeline(stage, v, versionRef.current);
      if (r.ok && r.version !== undefined) versionRef.current = r.version;
      return r;
    },
    writable,
  );
  const byId = new Map(evidence.map((e) => [e.id, e]));

  const update = (i: number, patch: Partial<TimelineEntry>) =>
    setEntries((list) => list.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const move = (i: number, dir: -1 | 1) =>
    setEntries((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const remove = (i: number) => setEntries((list) => list.filter((_, j) => j !== i));
  const insertAt = (i: number) => setEntries((list) => [...list.slice(0, i), newEntry(), ...list.slice(i)]);

  const input = "w-full rounded-md border border-line bg-ink px-2 py-1.5 text-sm focus:border-accent focus:outline-none disabled:opacity-60";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">
          Put the events in the order they happened. Link each step to the evidence that proves it.
        </p>
        <SaveIndicator state={state} error={error} />
      </div>
      {state === "conflict" && (
        <div className="mb-3">
          <ConflictBanner onReload={() => router.refresh()} />
        </div>
      )}

      <ol className="relative space-y-3 border-l-2 border-line pl-6">
        {entries.map((e, i) => {
          const ev = e.evidence_id ? byId.get(e.evidence_id) : undefined;
          return (
            <li key={i} className="relative rounded-xl border border-line bg-panel p-3">
              <span className="absolute -left-[35px] top-4 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-ink">
                {i + 1}
              </span>
              <div className="grid gap-2 md:grid-cols-[140px_1fr_1.4fr_auto]">
                <input
                  aria-label={`Step ${i + 1} time`}
                  maxLength={60}
                  className={`${input} font-mono`}
                  placeholder="02:17"
                  value={e.time_label}
                  disabled={!writable}
                  onChange={(x) => update(i, { time_label: x.target.value })}
                />
                <select
                  aria-label={`Step ${i + 1} evidence`}
                  className={input}
                  value={e.evidence_id ?? ""}
                  disabled={!writable}
                  onChange={(x) => {
                    const id = x.target.value || null;
                    const picked = id ? byId.get(id) : undefined;
                    update(i, { evidence_id: id, time_label: e.time_label || picked?.time_label || "" });
                  }}
                >
                  <option value="">— no evidence linked —</option>
                  {evidence.map((o) => (
                    <option key={o.id} value={o.id}>{o.code} · {o.title}</option>
                  ))}
                </select>
                <input
                  aria-label={`Step ${i + 1} description`}
                  maxLength={500}
                  className={input}
                  placeholder="What happened at this point"
                  value={e.description}
                  disabled={!writable}
                  onChange={(x) => update(i, { description: x.target.value })}
                />
                {writable && (
                  <div className="flex items-center gap-1 text-muted">
                    <button type="button" title="Move up" onClick={() => move(i, -1)} className="rounded px-2 py-1 hover:bg-line hover:text-text">↑</button>
                    <button type="button" title="Move down" onClick={() => move(i, 1)} className="rounded px-2 py-1 hover:bg-line hover:text-text">↓</button>
                    <button type="button" title="Insert step below" onClick={() => insertAt(i + 1)} className="rounded px-2 py-1 hover:bg-line hover:text-text">＋</button>
                    <button type="button" title="Remove" onClick={() => remove(i)} className="rounded px-2 py-1 hover:bg-danger/20 hover:text-danger">✕</button>
                  </div>
                )}
              </div>
              {ev && <p className="mt-1 font-mono text-xs text-muted">Evidence {ev.code}{ev.time_label ? ` · ${ev.time_label}` : ""}</p>}
            </li>
          );
        })}
      </ol>

      {entries.length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No steps yet.</p>}

      {writable && entries.length < 60 && (
        <button
          type="button"
          onClick={() => setEntries((l) => [...l, newEntry()])}
          className="mt-4 rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10"
        >
          + Add step
        </button>
      )}
    </div>
  );
}
