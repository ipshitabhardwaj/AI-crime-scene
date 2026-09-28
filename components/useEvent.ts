"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EventRow } from "@/lib/types";

/**
 * Live view of the single `event` row, by polling.
 *
 * No Realtime websocket on purpose: Supabase's Free plan allows 200
 * concurrent Realtime connections and an event can have ~300 devices.
 * Polling a one-row table every ~10 s is cheap (≈30 requests/s for 300
 * devices) and survives flaky Wi-Fi, sleeping laptops and network switches.
 * It also re-checks immediately when the tab becomes visible or the
 * network comes back. `serverOffsetMs` corrects wrong laptop clocks.
 */
export function useEvent(initial: EventRow | null, intervalMs = 10_000) {
  const [event, setEvent] = useState<EventRow | null>(initial);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [online, setOnline] = useState(true);
  const [supabase] = useState(() => createClient());

  // A server re-render (router.refresh / revalidate) hands us fresher data:
  // adopt it during render (React's "adjust state on prop change" pattern).
  const [seenInitial, setSeenInitial] = useState(initial?.updated_at);
  if (initial && initial.updated_at !== seenInitial) {
    setSeenInitial(initial.updated_at);
    if (!event || initial.updated_at > event.updated_at) setEvent(initial);
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      try {
        const { data, error } = await supabase.from("event").select("*").eq("id", 1).maybeSingle<EventRow>();
        if (cancelled) return;
        if (error) throw error;
        setOnline(true);
        if (data) setEvent((cur) => (cur && cur.updated_at === data.updated_at ? cur : data));
      } catch {
        if (!cancelled) setOnline(false);
      }
    };

    const syncClock = async () => {
      try {
        const t0 = Date.now();
        const { data } = await supabase.rpc("server_now");
        const t1 = Date.now();
        if (!cancelled && typeof data === "string") setServerOffsetMs(new Date(data).getTime() - (t0 + t1) / 2);
      } catch {
        /* keep the previous offset */
      }
    };

    const loop = async () => {
      await refresh();
      if (cancelled) return;
      // ±20% jitter so hundreds of devices don't poll in lock-step
      timer = setTimeout(loop, intervalMs * (0.8 + Math.random() * 0.4));
    };

    const wake = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void syncClock();
        void loop();
      }
    };

    void syncClock();
    timer = setTimeout(loop, intervalMs * Math.random()); // spread the first poll
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [intervalMs, supabase]);

  return { event, serverOffsetMs, online };
}

/** Milliseconds left until `endsAt`, ticking every second. null if no deadline. */
export function useCountdown(endsAt: string | null | undefined, serverOffsetMs: number, extraMinutes = 0) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime() + extraMinutes * 60_000;
  return Math.max(0, end - (now + serverOffsetMs));
}

export function formatMs(ms: number) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
