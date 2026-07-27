import type { AgreementTypeRules } from "@/lib/workflow-config-types";
import type { ContractTypeRecord } from "@/types/contract-template";

export function buildAgreementTypeRulesFromContractTypes(
  types: ContractTypeRecord[],
): AgreementTypeRules {
  const activeTypes = types.filter((type) => type.isActive);

  return {
    parentAgreementTypes: activeTypes
      .filter((type) => type.canBeParentAgreement)
      .map((type) => type.label)
      .sort((left, right) => left.localeCompare(right)),
    childAgreementTypes: activeTypes
      .filter((type) => type.requiresParentAgreement)
      .map((type) => type.label)
      .sort((left, right) => left.localeCompare(right)),
  };
}

export function resolveAgreementTypeRules(
  contractTypes: ContractTypeRecord[],
  workflowFallback: AgreementTypeRules,
): AgreementTypeRules {
  const fromTypes = buildAgreementTypeRulesFromContractTypes(contractTypes);

  if (
    fromTypes.parentAgreementTypes.length > 0 ||
    fromTypes.childAgreementTypes.length > 0
  ) {
    return fromTypes;
  }

  return workflowFallback;
}

export function findContractTypeByLabel(
  label: string,
  types: ContractTypeRecord[],
): ContractTypeRecord | undefined {
  const normalized = label.trim().toLowerCase();
  return types.find((type) => type.label.trim().toLowerCase() === normalized);
}

export function contractTypeRequiresParent(
  contractTypeLabel: string,
  types: ContractTypeRecord[],
): boolean {
  const match = findContractTypeByLabel(contractTypeLabel, types);
  return match?.requiresParentAgreement ?? false;
}

export function contractTypeCanBeParent(
  contractTypeLabel: string,
  types: ContractTypeRecord[],
): boolean {
  const match = findContractTypeByLabel(contractTypeLabel, types);
  return match?.canBeParentAgreement ?? false;
}
