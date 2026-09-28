"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Shows ?ok= / ?err= left by an admin action. Success messages clear after 12 s. */
export default function Flash() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const ok = params.get("ok");
  const err = params.get("err");

  const dismiss = () => {
    const rest = new URLSearchParams(params.toString());
    ["ok", "err", "t"].forEach((k) => rest.delete(k));
    const qs = rest.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  };

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(dismiss, 12_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok]);

  if (!ok && !err) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 print:hidden">
      <div
        role={err ? "alert" : "status"}
        className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${err ? "border-danger/60 bg-danger/10" : "border-ok/50 bg-ok/10"}`}
      >
        <span className="flex-1 whitespace-pre-wrap break-words">{err ?? ok}</span>
        <button type="button" onClick={dismiss} className="text-muted hover:text-text" aria-label="Dismiss message">
          ✕
        </button>
      </div>
    </div>
  );
}
