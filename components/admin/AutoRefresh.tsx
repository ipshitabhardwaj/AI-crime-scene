"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetch server data every `seconds` (for live status tables). */
export default function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
