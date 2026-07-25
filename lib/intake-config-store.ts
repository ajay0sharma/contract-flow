import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  listContractTypes,
  updateContractType,
} from "@/lib/contract-type-store";
import {
  listContractTemplates,
  updateContractTemplate,
} from "@/lib/contract-template-store";
import type {
  ContractTemplateRecord,
  ContractTypeRecord,
  IntakeConfigTemplateUpdate,
  IntakeConfigTypeUpdate,
} from "@/types/contract-template";

export interface IntakeConfiguration {
  organizationId: string;
  contractTypes: ContractTypeRecord[];
  templates: ContractTemplateRecord[];
}

export async function getIntakeConfiguration(
  organizationId = resolveClauseLibraryOrganizationId(),
): Promise<IntakeConfiguration> {
  const [contractTypes, templates] = await Promise.all([
    listContractTypes(organizationId, { includeInactive: true }),
    listContractTemplates(organizationId),
  ]);

  return {
    organizationId,
    contractTypes,
    templates,
  };
}

export async function saveIntakeConfiguration(
  input: {
    organizationId: string;
    contractTypes: IntakeConfigTypeUpdate[];
    templates: IntakeConfigTemplateUpdate[];
    actorEmail: string;
  },
): Promise<{ error?: string }> {
  for (const typeUpdate of input.contractTypes) {
    const result = await updateContractType(
      typeUpdate.id,
      input.organizationId,
      {
        showInIntake: typeUpdate.showInIntake,
        displayOrder: typeUpdate.displayOrder,
      },
    );

    if (result.error) {
      return { error: result.error };
    }
  }

  for (const templateUpdate of input.templates) {
    const result = await updateContractTemplate(
      templateUpdate.id,
      input.organizationId,
      {
        showInIntake: templateUpdate.showInIntake,
        lastUpdatedById: input.actorEmail,
      },
    );

    if (!result) {
      return { error: "One or more templates could not be updated." };
    }
  }

  return {};
}
