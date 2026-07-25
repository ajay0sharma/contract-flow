import { ComingSoonPage } from "@/components/layout/ComingSoonPage";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminPageUser } from "@/lib/page-auth";

export default async function AdminSettingsPage() {
  await requireAdminPageUser();

  return (
    <AdminShell title="Settings">
      <ComingSoonPage title="Settings" />
    </AdminShell>
  );
}
