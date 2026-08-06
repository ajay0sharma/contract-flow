import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { ContractDetailClient } from "@/components/contracts/ContractDetailClient";
import { ContractRelationshipTree } from "@/components/contracts/ContractRelationshipTree";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { loadContractRelationships } from "@/lib/contract-relationships";
import { getDirectoryConfig } from "@/lib/directory-sync";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";

interface ContractPageProps {
  params: Promise<{ id: string }>;
}

export default async function ContractPage({ params }: ContractPageProps) {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const userEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!userEmail) {
    redirect("/login");
  }

  const { id } = await params;
  const isPrivilegedUser = isLegalEmail(userEmail) || isAdminEmail(userEmail);
  const isLegalUser = isLegalEmail(userEmail);
  const userName = getUserDisplayName(user);
  const organizationId = resolveClauseLibraryOrganizationId();
  const directoryConfig = await getDirectoryConfig(organizationId);
  const directoryEnabled = Boolean(directoryConfig?.isEnabled);
  const relationshipData = await loadContractRelationships(id, organizationId);

  const relationshipSection =
    relationshipData?.hasRelationships ? (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">
          Contract relationships
        </h2>
        <p className="mb-6 text-xs text-gray-500">
          Agreements linked to this contract record.
        </p>
        <ContractRelationshipTree data={relationshipData} />
      </div>
    ) : null;

  return (
    <ContractDetailClient
      contractId={id}
      userEmail={userEmail}
      userName={userName}
      isPrivilegedUser={isPrivilegedUser}
      isLegalUser={isLegalUser}
      directoryEnabled={directoryEnabled}
      relationshipSection={relationshipSection}
    />
  );
}
