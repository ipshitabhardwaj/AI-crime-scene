"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { phaseInfo } from "@/lib/constants";
import type { EventRow } from "@/lib/types";
import { formatMs, useCountdown, useEvent } from "./useEvent";

/** Sticky strip under the header: current phase, message and countdown. Live. */
export default function PhaseBanner({ initial, extraMinutes = 0 }: { initial: EventRow | null; extraMinutes?: number }) {
  const { event, serverOffsetMs, online } = useEvent(initial);
  const left = useCountdown(event?.phase_ends_at, serverOffsetMs, extraMinutes);
  const router = useRouter();

  // When the phase, twist or deadline changes — or the timer reaches zero —
  // re-render the server components so the page shows what is now allowed.
  const timeUp = left === 0;
  // updated_at also changes when an organiser gives this team extra time or
  // unlocks a submission (see nudgeTeamPages), so those reach open pages too.
  const key = `${event?.phase}|${event?.twist_released_at}|${event?.phase_ends_at}|${event?.updated_at}|${timeUp}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      router.refresh();
    }
  }, [key, router]);

  // Tell the team when the organisers gave them extra time.
  const prevExtra = useRef(extraMinutes);
  const [bonus, setBonus] = useState<number | null>(null);
  useEffect(() => {
    if (extraMinutes > prevExtra.current) {
      setBonus(extraMinutes - prevExtra.current);
      const t = setTimeout(() => setBonus(null), 60_000);
      prevExtra.current = extraMinutes;
      return () => clearTimeout(t);
    }
    prevExtra.current = extraMinutes;
  }, [extraMinutes]);

  if (!event) return null;
  const info = phaseInfo(event.phase);
  const urgent = left !== null && left < 5 * 60_000;

  return (
    <div className={`border-b backdrop-blur ${urgent ? "border-danger/50 bg-danger/10" : "border-line bg-panel/95"}`}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
        <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-accent">{info.label}</span>
        <span className="hidden flex-1 text-muted sm:block">{info.teamMessage}</span>
        {bonus !== null && (
          <span className="rounded bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok" role="status">
            +{bonus} min extra time for your team — keep going!
          </span>
        )}
        {!online && (
          <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent" role="status">
            Reconnecting…
          </span>
        )}
        {left !== null && (
          <span className="ml-auto flex items-baseline gap-2 sm:ml-0">
            <span className="text-xs uppercase tracking-wide text-muted">{left === 0 ? "" : "Time left"}</span>
            <span suppressHydrationWarning className={`font-mono text-lg font-bold tabular-nums ${urgent ? "text-danger" : "text-text"}`} aria-label="Time left">
              {left === 0 ? "Time up" : formatMs(left)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
