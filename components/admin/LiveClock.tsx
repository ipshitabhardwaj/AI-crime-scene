"use client";

import { formatMs, useCountdown, useEvent } from "@/components/useEvent";
import { phaseInfo } from "@/lib/constants";
import type { EventRow } from "@/lib/types";

export default function LiveClock({ initial }: { initial: EventRow | null }) {
  const { event, serverOffsetMs } = useEvent(initial, 4000);
  const left = useCountdown(event?.phase_ends_at, serverOffsetMs);
  return (
    <div>
      <p className="text-sm text-muted">Current phase</p>
      <p className="text-3xl font-bold">{event ? phaseInfo(event.phase).label : "—"}</p>
      <p className={`font-mono text-xl ${left !== null && left < 60_000 ? "text-danger" : "text-accent"}`}>
        {left === null ? "no timer" : left === 0 ? "time up" : formatMs(left)}
      </p>
    </div>
  );
}
