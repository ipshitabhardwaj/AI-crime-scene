"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminHelp from "@/components/admin/AdminHelp";
import LiveClock from "@/components/admin/LiveClock";
import type { EventRow } from "@/lib/types";

const TABS = [
  { href: "/admin", label: "1 Setup" },
  { href: "/admin/cases", label: "2 Cases" },
  { href: "/admin/teams", label: "3 Teams" },
  { href: "/admin/control", label: "4 Control room" },
  { href: "/admin/status", label: "5 Live status" },
  { href: "/admin/results", label: "6 Results" },
];

export default function AdminNav({ event }: { event: EventRow | null }) {
  const path = usePathname();
  return (
    <nav className="border-b border-line bg-panel/60 print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-panel2 text-text ring-1 ring-accent/50" : "text-muted hover:text-text"}`}
            >
              {t.label}
            </Link>
          );
        })}
        <span className="ml-auto flex items-center gap-3">
          <LiveClock initial={event} compact />
          <AdminHelp />
          <a href="/screen" target="_blank" className="rounded-md px-2 py-1.5 text-sm text-muted hover:text-text">
            Projector ↗
          </a>
        </span>
      </div>
    </nav>
  );
}
