"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { readTag, saveTag } from "@/app/actions/team";
import { TAG_STYLES } from "@/lib/phase";
import type { EvidenceTag } from "@/lib/types";
import { SaveIndicator, useAutosave } from "./useAutosave";

const SHORT_HELP = {
  relevant: "Part of what really happened, or proves it.",
  misleading: "Points to a wrong explanation (a red herring).",
  irrelevant: "Just background noise.",
} as const;

/** How often an open item re-checks for a teammate's tag change. */
const SYNC_MS = 20_000;

export default function TagPanel({
  evidenceId,
  initialTag,
  initialNote,
  writable,
  closedReason,
  nextHref,
  nextLabel,
}: {
  evidenceId: string;
  initialTag: EvidenceTag | null;
  initialNote: string;
  writable: boolean;
  closedReason: string;
  nextHref?: string;
  nextLabel?: string;
}) {
  const [value, setValue] = useState({ tag: initialTag, note: initialNote });
  const { state, error, adopt } = useAutosave(value, (v) => saveTag(evidenceId, v.tag, v.note), writable, 700);
  const [teammate, setTeammate] = useState(false);
  const [lostNote, setLostNote] = useState<string | null>(null);

  // Same team, several devices: every ~20 s (only while this tab is visible and
  // nothing is being typed or saved here) re-read the tag, so a teammate's
  // change shows up. Last click still wins; this only keeps the display honest.
  const live = useRef({ value, state });
  useEffect(() => {
    live.current = { value, state };
  });
  useEffect(() => {
    if (!writable) return; // locked: nothing can change any more
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const busy = (s: string) => s === "pending" || s === "saving" || s === "offline";
      if (document.visibilityState === "visible" && !busy(live.current.state)) {
        const before = JSON.stringify(live.current.value);
        try {
          const server = await readTag(evidenceId);
          const now = live.current;
          if (!cancelled && server && JSON.stringify(now.value) === before && !busy(now.state) && JSON.stringify(server) !== before) {
            const mine = (JSON.parse(before) as { note: string }).note;
            if (mine.trim() && server.note !== mine) setLostNote(mine);
            adopt(server);
            setValue(server);
            setTeammate(true);
          }
        } catch {
          /* offline: try again next time */
        }
      }
      if (!cancelled) timer = setTimeout(tick, SYNC_MS * (0.8 + Math.random() * 0.4));
    };
    timer = setTimeout(tick, SYNC_MS * (0.5 + Math.random() * 0.5));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [evidenceId, adopt, writable]);

  return (
    <aside className="h-fit rounded-xl border border-line bg-panel p-4 lg:sticky lg:top-16">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Your assessment</h2>
        <SaveIndicator state={state} error={error} />
      </div>
      {teammate && (
        <p role="status" className="mb-2 rounded-md border border-info/40 bg-info/10 px-2 py-1 text-xs text-info">
          A teammate changed this on another device — showing their latest choice.
        </p>
      )}
      {lostNote !== null && writable && (
        <div role="status" className="mb-2 rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-xs">
          <p>Their change replaced your note: “{lostNote.length > 120 ? lostNote.slice(0, 120) + "…" : lostNote}”</p>
          <button
            type="button"
            className="mt-1 font-semibold text-accent underline"
            onClick={() => {
              setValue((v) => ({ ...v, note: lostNote }));
              setLostNote(null);
              setTeammate(false);
            }}
          >
            Put my note back
          </button>
        </div>
      )}
      <p className="mb-2 text-sm text-muted">What is this item?</p>
      <div className="space-y-2" role="radiogroup" aria-label="Classify this evidence">
        {(["relevant", "misleading", "irrelevant"] as const).map((t) => {
          const active = value.tag === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={TAG_STYLES[t].label}
              disabled={!writable}
              onClick={() => {
                setTeammate(false);
                setValue((v) => ({ ...v, tag: active ? null : t }));
              }}
              className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
                active ? TAG_STYLES[t].cls : "border-line hover:border-accent/60"
              }`}
            >
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-current" : "border-line"}`}>
                {active && <span className="h-2 w-2 rounded-full bg-current" />}
              </span>
              <span>
                <span className="block text-sm font-semibold">{TAG_STYLES[t].label}</span>
                <span className={`block text-xs ${active ? "opacity-90" : "text-muted"}`}>{SHORT_HELP[t]}</span>
              </span>
            </button>
          );
        })}
      </div>
      <label className="mt-4 block">
        <span className="mb-1 block text-sm text-muted">Your notes (optional)</span>
        <textarea
          value={value.note}
          disabled={!writable}
          maxLength={2000}
          onChange={(e) => setValue((v) => ({ ...v, note: e.target.value }))}
          rows={4}
          className="w-full rounded-md border border-line bg-ink p-3 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
          placeholder="e.g. Same time as E07 — this is what started it."
        />
      </label>
      {!writable && <p className="mt-2 rounded-md border border-line bg-ink p-2 text-xs text-muted">🔒 {closedReason}</p>}
      {nextHref && (
        <Link
          prefetch={false}
          href={nextHref}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold ${value.tag ? "bg-accent text-ink hover:brightness-110" : "border border-line text-muted hover:border-accent hover:text-text"}`}
        >
          {nextLabel ?? "Next item"} →
        </Link>
      )}
    </aside>
  );
}
