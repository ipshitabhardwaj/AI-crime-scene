"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/cases", label: "Cases" },
  { href: "/admin/control", label: "Control room" },
  { href: "/admin/results", label: "Results" },
];

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 pt-4 print:hidden">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`rounded-md px-4 py-2 text-sm font-medium ${active ? "bg-panel text-text ring-1 ring-line" : "text-muted hover:text-text"}`}>
            {t.label}
          </Link>
        );
      })}
      <a href="/screen" target="_blank" className="ml-auto rounded-md px-4 py-2 text-sm text-muted hover:text-text">Projector ↗</a>
    </nav>
  );
}
