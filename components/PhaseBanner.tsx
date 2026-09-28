"use client";

import { useEffect, useRef } from "react";
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
  const key = `${event?.phase}|${event?.twist_released_at}|${event?.phase_ends_at}|${timeUp}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      router.refresh();
    }
  }, [key, router]);

  if (!event) return null;
  const info = phaseInfo(event.phase);
  const urgent = left !== null && left < 5 * 60_000;

  return (
    <div className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
        <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-accent">
          {info.label}
        </span>
        <span className="flex-1 text-muted">{info.teamMessage}</span>
        {!online && <span className="text-xs text-accent" role="status">Reconnecting…</span>}
        {left !== null && (
          <span className={`font-mono text-base font-semibold ${urgent ? "text-danger" : "text-text"}`} aria-label="Time left">
            {left === 0 ? "Time up" : formatMs(left)}
          </span>
        )}
      </div>
    </div>
  );
}
