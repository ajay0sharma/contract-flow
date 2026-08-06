import { OrganizationSignatureConfigClient } from "@/components/admin/OrganizationSignatureConfigClient";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminOrganizationPageContext } from "@/lib/admin-organization-page";

export default async function AdminSignaturePage() {
  const { organizationId, organizations } =
    await requireAdminOrganizationPageContext();

  return (
    <AdminShell
      title="E-signature integration"
      description="Connect DocuSign, Dropbox Sign, or your client's e-signature application for each organization."
      organizations={organizations}
      activeOrganizationId={organizationId}
    >
      <OrganizationSignatureConfigClient organizationId={organizationId} />
    </AdminShell>
  );
}
