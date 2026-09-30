"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavBadges = { evidence: string; timeline: string; report: string; reportTone: "ok" | "accent" | "muted" };

/** Numbered tabs: 1 Evidence → 2 Timeline → 3 Report, each with its status. */
export default function PlayNav({ badges }: { badges: NavBadges }) {
  const path = usePathname();
  const tabs = [
    { href: "/play", n: 1, label: "Evidence", badge: badges.evidence, tone: "muted" as const },
    { href: "/play/timeline", n: 2, label: "Timeline", badge: badges.timeline, tone: "muted" as const },
    { href: "/play/report", n: 3, label: "Report", badge: badges.report, tone: badges.reportTone },
  ];
  const toneCls = { ok: "bg-ok/15 text-ok", accent: "bg-accent/15 text-accent", muted: "bg-line/60 text-muted" };
  return (
    <nav aria-label="Case file sections" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel p-1">
      {tabs.map((t) => {
        const active = t.href === "/play" ? path === "/play" || path.startsWith("/play/evidence") : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            prefetch={false}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-start gap-1 rounded-lg px-3 py-2 sm:flex-row sm:items-center sm:gap-2 ${active ? "bg-panel2 ring-1 ring-accent/50" : "hover:bg-panel2"}`}
          >
            <span className="flex items-center gap-2">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-bold ${active ? "bg-accent text-ink" : "border border-line text-muted"}`}>{t.n}</span>
              <span className={`text-sm font-semibold ${active ? "text-text" : "text-muted"}`}>{t.label}</span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium sm:ml-auto ${toneCls[t.tone]}`}>{t.badge}</span>
          </Link>
        );
      })}
    </nav>
  );
}
