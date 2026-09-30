"use client";

import { formatMs, useCountdown, useEvent } from "@/components/useEvent";
import { phaseInfo } from "@/lib/constants";
import type { EventRow } from "@/lib/types";

export default function LiveClock({ initial, compact = false }: { initial: EventRow | null; compact?: boolean }) {
  const { event, serverOffsetMs, online } = useEvent(initial, 4000);
  const left = useCountdown(event?.phase_ends_at, serverOffsetMs);
  const label = event ? phaseInfo(event.phase).label : "—";
  const time = left === null ? "no timer" : left === 0 ? "time up" : formatMs(left);
  const urgent = left !== null && left < 60_000;
  if (compact) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-ink px-3 py-1 text-xs">
        <span className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-danger"}`} aria-hidden />
        <span className="font-semibold">{label}</span>
        <span suppressHydrationWarning className={`font-mono tabular-nums ${urgent ? "text-danger" : "text-accent"}`}>
          {time}
        </span>
      </span>
    );
  }
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Current phase</p>
      <p className="text-3xl font-bold">{label}</p>
      <p suppressHydrationWarning className={`font-mono text-2xl tabular-nums ${urgent ? "text-danger" : "text-accent"}`}>
        {time}
      </p>
    </div>
  );
}
