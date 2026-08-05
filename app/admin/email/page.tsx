import { OrganizationEmailConfigClient } from "@/components/admin/OrganizationEmailConfigClient";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminOrganizationPageContext } from "@/lib/admin-organization-page";

export default async function AdminEmailPage() {
  const { organizationId, organizations } =
    await requireAdminOrganizationPageContext();

  return (
    <AdminShell
      title="Email integration"
      description="Configure inbound and outbound contract email handling for the active client."
      organizations={organizations}
      activeOrganizationId={organizationId}
    >
      <OrganizationEmailConfigClient organizationId={organizationId} />
    </AdminShell>
  );
}
