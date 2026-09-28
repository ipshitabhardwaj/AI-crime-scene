"use client";

import Link from "next/link";

/** Last-resort error screen (e.g. the network dropped during navigation). */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border border-line bg-panel p-6">
        <h1 className="text-lg font-semibold">Something went wrong loading this page</h1>
        <p className="mt-2 text-sm text-muted">
          This is usually a network hiccup. Your saved work is safe on the server. Try again; if it keeps happening, tell an organiser.
        </p>
        <div className="mt-4 flex gap-3">
          <button onClick={reset} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink">Try again</button>
          <Link href="/" className="rounded-md border border-line px-4 py-2 text-sm">Go to start</Link>
        </div>
      </div>
    </main>
  );
}
