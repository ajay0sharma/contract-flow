import { OrganizationBrandingClient } from "@/components/admin/OrganizationBrandingClient";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminOrganizationPageContext } from "@/lib/admin-organization-page";

export default async function AdminOrganizationPage() {
  const { organizationId, organizations } =
    await requireAdminOrganizationPageContext();

  return (
    <AdminShell
      title="Organization branding"
      description="Upload a custom logo and configure the platform name, tagline, and accent color for your organization."
      organizations={organizations}
      activeOrganizationId={organizationId}
    >
      <OrganizationBrandingClient organizationId={organizationId} />
    </AdminShell>
  );
}
