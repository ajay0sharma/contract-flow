import { DirectoryIntegrationClient } from "@/components/settings/DirectoryIntegrationClient";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminOrganizationPageContext } from "@/lib/admin-organization-page";

export default async function AdminDirectoryPage() {
  const { organizationId, organizations } =
    await requireAdminOrganizationPageContext();

  return (
    <AdminShell
      title="User directory"
      description="Connect Microsoft 365 or Google Workspace for the active client."
      organizations={organizations}
      activeOrganizationId={organizationId}
    >
      <DirectoryIntegrationClient organizationId={organizationId} />
    </AdminShell>
  );
}
