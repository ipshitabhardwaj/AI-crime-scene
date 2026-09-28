"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/app/actions/team";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "offline" | "conflict" | "error";

/**
 * Saves `value` 1 s after it stops changing.
 * - Saves run one at a time (a newer value is saved right after the current one).
 * - Network failures are retried every 4 s and as soon as the browser is back online.
 * - A version conflict (teammate saved on another device) stops saving until reload.
 * - Leaving the page with unsaved changes shows the browser's "leave site?" prompt.
 * `flush()` waits for everything pending to be saved (used before submitting).
 */
export function useAutosave<T>(value: T, save: (v: T) => Promise<ActionResult>, enabled: boolean, delay = 1000) {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const serialized = JSON.stringify(value);
  const latest = useRef(serialized);
  const lastSaved = useRef(serialized);
  const saveRef = useRef(save);
  const inFlight = useRef<Promise<void> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false); // conflict / closed: stop trying

  useEffect(() => {
    saveRef.current = save;
    latest.current = serialized;
  });

  const runRef = useRef<() => Promise<void>>(async () => {});
  const run = useCallback((): Promise<void> => runRef.current(), []);

  useEffect(() => {
    runRef.current = async (): Promise<void> => {
    if (inFlight.current) {
      await inFlight.current;
      if (latest.current !== lastSaved.current && !stopped.current) return run();
      return;
    }
    if (stopped.current || latest.current === lastSaved.current) return;
    const snapshot = latest.current;
    setState("saving");
    const p = (async () => {
      try {
        const r = await saveRef.current(JSON.parse(snapshot) as T);
        if (r.ok) {
          lastSaved.current = snapshot;
          setError(null);
          setState(latest.current === snapshot ? "saved" : "pending");
        } else {
          stopped.current = r.code !== "ERROR";
          setError(r.error);
          setState(r.code === "CONFLICT" ? "conflict" : "error");
        }
      } catch {
        setError("No connection. Your changes are kept here and will be saved automatically.");
        setState("offline");
        if (retry.current) clearTimeout(retry.current);
        retry.current = setTimeout(() => {
          retry.current = null;
          void run();
        }, 4000);
      }
    })();
    inFlight.current = p;
    await p;
    inFlight.current = null;
    if (latest.current !== lastSaved.current && !stopped.current && !retry.current) return run();
    };
  }, [run]);

  // debounce on change
  useEffect(() => {
    if (!enabled || serialized === lastSaved.current) return;
    setState("pending");
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (retry.current) {
        clearTimeout(retry.current);
        retry.current = null;
      }
      void run();
    }, delay);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [serialized, enabled, delay, run]);

  // retry when the network comes back; warn before leaving with unsaved work
  useEffect(() => {
    const online = () => {
      if (retry.current) {
        clearTimeout(retry.current);
        retry.current = null;
        void run();
      }
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (enabled && latest.current !== lastSaved.current && !stopped.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeUnload);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [enabled, run]);

  const flush = useCallback(async () => {
    if (debounce.current) clearTimeout(debounce.current);
    if (retry.current) {
      clearTimeout(retry.current);
      retry.current = null;
    }
    await run();
  }, [run]);

  return { state, error, flush };
}

export function SaveIndicator({ state, error }: { state: SaveState; error: string | null }) {
  const base = "text-xs";
  if (state === "pending" || state === "saving") return <span className={`${base} text-muted`} aria-live="polite">Saving…</span>;
  if (state === "saved") return <span className={`${base} text-ok`} aria-live="polite">All changes saved</span>;
  if (state === "offline") return <span className={`${base} text-accent`} role="status">{error}</span>;
  if (state === "error" || state === "conflict") return <span className={`${base} text-danger`} role="alert">{error ?? "Not saved"}</span>;
  return null;
}

/** Shown when a teammate saved a newer version on another device. */
export function ConflictBanner({ onReload }: { onReload: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">
      <b>A teammate changed this on another device.</b> Your last edits here were not saved, so nothing of theirs was
      overwritten. Copy anything you need, then{" "}
      <button type="button" onClick={onReload} className="font-semibold underline">
        load the latest version
      </button>
      . Tip: let one person edit the timeline and one the report.
    </div>
  );
}
