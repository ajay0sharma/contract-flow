import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ContractTemplatesClient } from "@/components/templates/ContractTemplatesClient";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { listContractTypes } from "@/lib/contract-type-store";
import { listContractTemplates } from "@/lib/contract-template-store";
import { isAdminEmail, isLegalEmail, canManagePlatformSettings } from "@/lib/legal-access";
import { resolveActiveOrganizationId } from "@/lib/organization-context";

export default async function ContractTemplatesPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!isLegalEmail(email) && !isAdminEmail(email)) {
    redirect("/dashboard");
  }

  const organizationId = await resolveActiveOrganizationId(email);
  const [templates, contractTypes] = await Promise.all([
    listContractTemplates(organizationId),
    listContractTypes(organizationId),
  ]);
  const isLegalUser = isLegalEmail(email) || isAdminEmail(email);

  return (
    <SettingsShell
      title="Contract templates"
      description="Manage Word document templates with variables and version history."
      isAdmin={canManagePlatformSettings(email)}
    >
      <ContractTemplatesClient
        initialTemplates={templates}
        initialContractTypes={contractTypes}
        organizationId={organizationId}
        isLegalUser={isLegalUser}
      />
    </SettingsShell>
  );
}
