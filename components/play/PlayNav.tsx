"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/play", label: "Case file" },
  { href: "/play/timeline", label: "Timeline" },
  { href: "/play/report", label: "Report" },
];

export default function PlayNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 px-4 pt-4">
      {TABS.map((t) => {
        const active = t.href === "/play" ? path === "/play" || path.startsWith("/play/evidence") : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            prefetch={false}
            href={t.href}
            className={`rounded-md px-4 py-2 text-sm font-medium ${active ? "bg-panel text-text ring-1 ring-line" : "text-muted hover:text-text"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
