import { OrganizationBrandingClient } from "@/components/admin/OrganizationBrandingClient";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminPageUser } from "@/lib/page-auth";

export default async function AdminOrganizationPage() {
  await requireAdminPageUser();

  return (
    <AdminShell
      title="Organization branding"
      description="Upload a custom logo and configure the platform name, tagline, and accent color for your organization."
    >
      <OrganizationBrandingClient />
    </AdminShell>
  );
}
