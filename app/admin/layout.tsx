import { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import Flash from "@/components/Flash";
import AdminNav from "@/components/admin/AdminNav";
import { requireRole } from "@/lib/auth";
import { getEvent } from "@/lib/event";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin");
  const event = await getEvent();
  return (
    <div className="min-h-screen">
      <div className="print:hidden">
        <AppHeader area="Control room" who={session.profile.display_name ?? session.email ?? "Admin"} />
      </div>
      <AdminNav event={event} />
      <Suspense>
        <Flash />
      </Suspense>
      <main className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
