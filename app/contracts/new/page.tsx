import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ContractIntakeForm } from "@/components/contracts/ContractIntakeForm";
import { getActiveParentAgreementOptions } from "@/lib/contract-list-service";
import { getCounterparties } from "@/lib/counterparty-store";
import { ensurePlatformDataHydrated } from "@/lib/platform-data-db";
import { getAllowedOrganizationIds } from "@/lib/clause-library-org";
import { listIntakeContractTemplatesForOrganizations } from "@/lib/contract-template-store";
import { resolveAgreementTypeRules } from "@/lib/contract-type-agreement-rules";
import { listContractTypes } from "@/lib/contract-type-store";
import { isAdminEmail, isLegalEmail, isSupportEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";
import { getWorkflowConfig } from "@/lib/workflow-config-read";
import {
  ensureDefaultIntakeForm,
  getActiveIntakeForm,
} from "@/lib/intake-form-store";

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
  await ensurePlatformDataHydrated();
  const workflowConfig = getWorkflowConfig();
  const organizationIds = getAllowedOrganizationIds();
  const organizationId = organizationIds[0] ?? "default";
  let contractTemplates: Awaited<
    ReturnType<typeof listIntakeContractTemplatesForOrganizations>
  > = [];
  let intakeContractTypes: Awaited<ReturnType<typeof listContractTypes>> = [];
  let agreementTypeRules = workflowConfig.agreementTypeRules;
  let intakeForm = await getActiveIntakeForm(organizationId);

  try {
    const [templates, allContractTypes] = await Promise.all([
      listIntakeContractTemplatesForOrganizations(organizationIds),
      listContractTypes(organizationId),
    ]);

    contractTemplates = templates;
    intakeContractTypes = allContractTypes.filter(
      (type) => type.isActive && type.showInIntake,
    );
    agreementTypeRules = resolveAgreementTypeRules(
      allContractTypes,
      workflowConfig.agreementTypeRules,
    );
    intakeForm =
      intakeForm ?? (await ensureDefaultIntakeForm(organizationId));
  } catch (error) {
    console.error("Failed to load intake configuration:", error);
    intakeForm =
      intakeForm ?? (await ensureDefaultIntakeForm(organizationId));
  }

  const parentAgreementOptions = await getActiveParentAgreementOptions(
    agreementTypeRules.parentAgreementTypes,
    organizationId,
    email,
  );

  return (
    <PageShell width="wide">
      <ContractIntakeForm
          requesterName={requesterName}
          counterparties={await getCounterparties(organizationId)}
          agreementTypeRules={agreementTypeRules}
          parentAgreementOptions={parentAgreementOptions}
          contractTemplates={contractTemplates}
          intakeContractTypes={intakeContractTypes}
          intakeFormLayout={intakeForm}
        />
    </PageShell>
  );
}
