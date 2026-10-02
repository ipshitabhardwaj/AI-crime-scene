"use client";

import { useState, useTransition } from "react";
import { uploadCase, type UploadResult } from "@/app/actions/admin-cases";
import { ui } from "@/lib/ui";

export default function UploadCase({ inProgress }: { inProgress: boolean }) {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [allow, setAllow] = useState(false);
  const [pending, start] = useTransition();

  const onFile = (file: File) =>
    start(async () => {
      setResult(null);
      try {
        setResult(await uploadCase(await file.text(), allow));
      } catch {
        setResult({ ok: false, error: "Upload failed (network). Try again." });
      }
    });

  return (
    <div className="space-y-2">
      {inProgress && (
        <label className="flex items-center gap-2 rounded-md border border-accent/50 bg-accent/10 p-2 text-sm">
          <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
          The event is running. I understand that changing a case now changes what teams see and how they are scored.
        </label>
      )}
      <input type="file" accept=".json,application/json" disabled={pending} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} className="text-sm" />
      {pending && <p className="text-sm text-muted">Validating and loading…</p>}
      {result?.ok && <p className="text-sm text-ok">{result.message}</p>}
      {result && !result.ok && <pre className={`${ui.card} whitespace-pre-wrap text-sm text-danger`}>{result.error}</pre>}
      <p className="text-xs text-muted">
        Uploading a case with an existing code updates it in place (teams keep their answers). Questions removed from the file are deleted.
      </p>
    </div>
  );
}
