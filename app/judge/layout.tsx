import { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import Flash from "@/components/Flash";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function JudgeLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("judge");
  return (
    <div className="min-h-screen">
      <AppHeader area="Judging" who={session.profile.display_name ?? session.email ?? "Judge"} />
      <Suspense>
        <Flash />
      </Suspense>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
