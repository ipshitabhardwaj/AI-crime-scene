"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-danger/50 bg-danger/10 p-6">
      <h2 className="font-semibold text-danger">This page could not be loaded</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm">{error.message}</p>
      {error.digest && <p className="mt-1 text-xs text-muted">Error reference: {error.digest} (see Vercel logs)</p>}
      <button onClick={reset} className="mt-4 rounded-md border border-line px-4 py-2 text-sm">Try again</button>
    </div>
  );
}
