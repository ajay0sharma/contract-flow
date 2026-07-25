import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ContractIntakeForm } from "@/components/contracts/ContractIntakeForm";
import { getActiveParentAgreementOptions } from "@/lib/contract-store";
import { getCounterparties } from "@/lib/counterparty-store";
import { getAllowedOrganizationIds } from "@/lib/clause-library-org";
import { listIntakeContractTemplatesForOrganizations } from "@/lib/contract-template-store";
import { listIntakeContractTypes } from "@/lib/contract-type-store";
import { isAdminEmail, isLegalEmail, isSupportEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";
import { getWorkflowConfig } from "@/lib/workflow-store";

export default async function NewContractPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (isAdminEmail(email)) {
    redirect("/admin/dashboard");
  }

  if (isLegalEmail(email)) {
    redirect("/legal/dashboard");
  }

  if (isSupportEmail(email)) {
    redirect("/dashboard");
  }

  const requesterName = getUserDisplayName(user);
  const workflowConfig = getWorkflowConfig();
  const parentAgreementOptions = getActiveParentAgreementOptions(
    workflowConfig.agreementTypeRules.parentAgreementTypes,
    email,
  );

  const organizationIds = getAllowedOrganizationIds();
  let contractTemplates: Awaited<
    ReturnType<typeof listIntakeContractTemplatesForOrganizations>
  > = [];
  let intakeContractTypes: Awaited<
    ReturnType<typeof listIntakeContractTypes>
  > = [];

  try {
    [contractTemplates, intakeContractTypes] = await Promise.all([
      listIntakeContractTemplatesForOrganizations(organizationIds),
      listIntakeContractTypes(organizationIds[0] ?? "default"),
    ]);
  } catch (error) {
    console.error("Failed to load intake configuration:", error);
    contractTemplates = [];
    intakeContractTypes = [];
  }

  return (
    <PageShell width="wide">
      <ContractIntakeForm
          requesterName={requesterName}
          counterparties={getCounterparties()}
          agreementTypeRules={workflowConfig.agreementTypeRules}
          parentAgreementOptions={parentAgreementOptions}
          contractTemplates={contractTemplates}
          intakeContractTypes={intakeContractTypes}
        />
    </PageShell>
  );
}
