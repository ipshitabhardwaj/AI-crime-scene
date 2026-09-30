"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PHASES, phaseInfo } from "@/lib/constants";
import type { EventRow } from "@/lib/types";
import { formatMs, useCountdown, useEvent } from "./useEvent";

export type ScreenBoard = { rank: number; name: string; institution: string | null; total: number | null }[];

export default function ScreenView({ initial, board }: { initial: EventRow | null; board: ScreenBoard }) {
  const { event, serverOffsetMs } = useEvent(initial, 4000);
  const left = useCountdown(event?.phase_ends_at, serverOffsetMs);
  const info = phaseInfo(event?.phase ?? "waiting");
  const phase = event?.phase ?? "waiting";
  const router = useRouter();

  // Re-fetch the board from the server when the phase changes.
  const last = useRef(phase);
  useEffect(() => {
    if (last.current !== phase) {
      last.current = phase;
      router.refresh();
    }
  }, [phase, router]);

  return (
    <main className="flex min-h-screen flex-col">
      <style>{`@keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}`}</style>
      <div className="tape h-4 w-full" />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <p className="font-mono text-lg uppercase tracking-[0.4em] text-accent">The AI Files · Decode the Crime</p>

        {phase === "results" && board.length > 0 ? (
          <Results board={board} />
        ) : phase === "presentations" && board.length > 0 ? (
          <>
            <h1 className="text-5xl font-black md:text-7xl">Presentations</h1>
            <ol className="w-full max-w-3xl space-y-2 text-left text-2xl">
              {board.map((r) => (
                <li key={r.rank} className="flex gap-4 rounded-lg border border-line bg-panel px-5 py-3">
                  <span className="w-10 font-mono text-accent">{r.rank}</span>
                  <span className="font-semibold">{r.name}</span>
                  <span className="ml-auto text-lg text-muted">{r.institution}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            {phase === "twist" && <p className="stamp text-2xl text-danger">Case update</p>}
            <h1 className={`text-6xl font-black tracking-tight md:text-8xl ${phase === "twist" ? "animate-pulse text-danger" : ""}`}>
              {phase === "twist" ? "NEW EVIDENCE RELEASED" : info.label}
            </h1>
            <p className="max-w-3xl text-xl text-muted md:text-2xl">{info.teamMessage}</p>
            {left !== null && (
              <div className="mt-4">
                <p className="font-mono text-sm uppercase tracking-[0.4em] text-muted">{left === 0 ? "" : "Time left"}</p>
                <p suppressHydrationWarning className={`font-mono text-8xl font-bold tabular-nums md:text-[10rem] ${left < 5 * 60_000 ? "text-danger" : ""}`}>
                  {left === 0 ? "TIME UP" : formatMs(left)}
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <ol className="mx-auto flex flex-wrap justify-center gap-2 px-6 pb-6" aria-label="Event phases">
        {PHASES.slice(1).map((p, i) => {
          const cur = PHASES.findIndex((x) => x.id === phase);
          const st = i + 1 < cur ? "done" : i + 1 === cur ? "now" : "todo";
          return (
            <li
              key={p.id}
              className={`rounded-full border px-4 py-1.5 font-mono text-sm ${st === "now" ? "border-accent bg-accent text-ink" : st === "done" ? "border-line text-muted line-through" : "border-line text-muted"}`}
            >
              {p.label}
            </li>
          );
        })}
      </ol>
      <div className="tape h-4 w-full" />
    </main>
  );
}

/** Reveal from last place up to the champion, one row every 1.5 s. */
function Results({ board }: { board: ScreenBoard }) {
  const n = board.length;
  return (
    <>
      <h1 className="text-5xl font-black md:text-7xl">Results</h1>
      <ol className="w-full max-w-3xl space-y-2 text-left">
        {board.map((r) => {
          const delay = (n - r.rank) * 1.5;
          const champ = r.rank === 1;
          return (
            <li
              key={r.rank}
              style={{ animation: `rise 0.8s ease-out ${delay}s both` }}
              className={`flex items-center gap-4 rounded-lg border px-5 py-3 ${champ ? "border-accent bg-accent/15 text-3xl" : "border-line bg-panel text-2xl"}`}
            >
              <span className={`w-12 font-mono ${champ ? "text-accent" : "text-muted"}`}>{r.rank}</span>
              <span className="font-semibold">{r.name}</span>
              <span className="ml-auto font-mono">{r.total}</span>
            </li>
          );
        })}
      </ol>
      <p style={{ animation: `rise 0.8s ease-out ${n * 1.5}s both` }} className="text-2xl font-bold text-accent">
        AI Files Champion: {board[0]?.name}
      </p>
    </>
  );
}
