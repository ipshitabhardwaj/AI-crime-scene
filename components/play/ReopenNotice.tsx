"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";

const EVT = "aif-reopen-change";
const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
};
const read = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Tells a team that the organisers reopened a submission (unlock). Each device
 * remembers (sessionStorage) that it saw the stage as submitted; if the stage
 * later shows up as editable again, the notice appears until they resubmit.
 */
export default function ReopenNotice({ teamCode, stage, submitted, writable }: { teamCode: string; stage: "initial" | "final"; submitted: boolean; writable: boolean }) {
  const seenKey = `aif-sub-${teamCode}-${stage}`;
  const flagKey = `aif-reopened-${teamCode}-${stage}`;
  const flagged = useSyncExternalStore(subscribe, () => read(flagKey) === "1", () => false);

  useEffect(() => {
    try {
      if (submitted) {
        sessionStorage.setItem(seenKey, "1");
        sessionStorage.removeItem(flagKey);
      } else if (writable && sessionStorage.getItem(seenKey)) {
        sessionStorage.removeItem(seenKey);
        sessionStorage.setItem(flagKey, "1");
      }
      window.dispatchEvent(new Event(EVT));
    } catch {
      /* storage blocked: no notice */
    }
  }, [seenKey, flagKey, submitted, writable]);

  if (!flagged || submitted || !writable) return null;
  const name = stage === "initial" ? "Initial Conclusion" : "Final Report";
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-ok/60 bg-ok/10 p-4">
      <p className="min-w-0 flex-1">
        <b className="text-ok">🔓 Editing reopened.</b> The organisers unlocked your {name}. You can change it again — press <b>Submit</b> when you are done.
      </p>
      <Link prefetch={false} href="/play/report" className="rounded-lg bg-ok px-4 py-2 text-sm font-semibold text-ink">
        Open {name} →
      </Link>
    </div>
  );
}
