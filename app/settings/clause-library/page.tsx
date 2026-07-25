import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ClauseLibraryClient } from "@/components/clause-library/ClauseLibraryClient";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { getAllContractTypes } from "@/lib/company-config";
import { listClauses } from "@/lib/clause-library-store";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { isLegalEmail, canManagePlatformSettings } from "@/lib/legal-access";

export default async function ClauseLibraryPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!isLegalEmail(email)) {
    redirect("/dashboard");
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const clauses = await listClauses(organizationId);
  const contractTypes = getAllContractTypes();

  return (
    <SettingsShell
      title="Clause library"
      description="Manage approved clause language, fallback positions, and negotiator notes for your organization."
      isAdmin={canManagePlatformSettings(email)}
    >
      <ClauseLibraryClient
        initialClauses={clauses}
        contractTypes={contractTypes}
        organizationId={organizationId}
      />
    </SettingsShell>
  );
}
