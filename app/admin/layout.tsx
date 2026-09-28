import { Suspense } from "react";
import AppHeader from "@/components/AppHeader";
import Flash from "@/components/Flash";
import AdminNav from "@/components/admin/AdminNav";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin");
  return (
    <div className="min-h-screen">
      <div className="print:hidden">
        <AppHeader area="Control room" who={session.profile.display_name ?? session.email ?? "Admin"} />
      </div>
      <AdminNav />
      <Suspense>
        <Flash />
      </Suspense>
      <main className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
