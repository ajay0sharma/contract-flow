import { OrganizationBrandingClient } from "@/components/admin/OrganizationBrandingClient";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminPageUser } from "@/lib/page-auth";

export default async function AdminOrganizationPage() {
  await requireAdminPageUser();

  return (
    <AdminShell
      title="Organization branding"
      description="Customize the header logo, platform name, tagline, and accent color for your organization."
    >
      <OrganizationBrandingClient />
    </AdminShell>
  );
}
