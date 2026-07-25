import type { CompanyConfig } from "@/lib/company-config";
import {
  getContractTypeLabel,
  type ContractTemplateRecord,
  type ContractTemplateType,
  type TemplateVariableRecord,
} from "@/types/contract-template";

const TEMPLATE_TYPE_CONTRACT_PREFERENCES: Record<
  ContractTemplateType,
  string[]
> = {
  nda: ["Non-Disclosure Agreement", "Mutual NDA", "NDA"],
  vendor: [
    "Vendor Agreement",
    "Master Services Agreement",
    "Enterprise MSA",
    "Software License",
  ],
  customer: [
    "Statement of Work",
    "Implementation SOW",
    "Professional Services",
    "Work Order",
  ],
  employment: ["Employment Agreement", "Offer Letter", "Employment"],
  saas: ["SaaS Agreement", "Subscription Agreement", "Software License"],
  consulting: ["Consulting Agreement", "Professional Services", "SOW"],
  partnership: ["Partnership Agreement", "Partner Agreement"],
  other: ["Vendor Agreement", "Professional Services", "Other"],
};

export function resolveCompanyContractType(
  templateType: ContractTemplateType,
  companyConfig: CompanyConfig,
): string {
  const availableTypes = companyConfig.contractTypes;
  const preferences = TEMPLATE_TYPE_CONTRACT_PREFERENCES[templateType];

  for (const preference of preferences) {
    const match = availableTypes.find(
      (type) => type.toLowerCase() === preference.toLowerCase(),
    );

    if (match) {
      return match;
    }
  }

  for (const preference of preferences) {
    const match = availableTypes.find((type) =>
      type.toLowerCase().includes(preference.toLowerCase()),
    );

    if (match) {
      return match;
    }
  }

  return availableTypes[0] ?? "Other";
}

export function validateTemplateVariableValues(
  variables: TemplateVariableRecord[],
  values: Record<string, string>,
): string | null {
  for (const variable of variables) {
    if (variable.isRequired && !values[variable.name]?.trim()) {
      return `${variable.label} is required.`;
    }
  }

  return null;
}

export function buildInitialVariableValues(
  template: ContractTemplateRecord,
): Record<string, string> {
  return Object.fromEntries(
    template.variables.map((variable) => [
      variable.name,
      variable.defaultValue?.trim() ?? "",
    ]),
  );
}

export interface IntakeFormVariableContext {
  companyName: string;
  address: string;
  mainContactName: string;
  mainContactTitle: string;
  mainContactEmail: string;
  mainContactPhone: string;
  contractStartDate: string;
  contractEndDate: string;
  contractAmount: string;
  contractTitle: string;
  poNumber: string;
}

const EXACT_VARIABLE_FIELD_MAP: Record<
  string,
  keyof IntakeFormVariableContext
> = {
  COUNTERPARTY_NAME: "companyName",
  COUNTERPARTY_ADDRESS: "address",
  COUNTERPARTY_CONTACT: "mainContactName",
  COUNTERPARTY_CONTACT_NAME: "mainContactName",
  COUNTERPARTY_EMAIL: "mainContactEmail",
  COUNTERPARTY_PHONE: "mainContactPhone",
  CONTRACT_START_DATE: "contractStartDate",
  CONTRACT_END_DATE: "contractEndDate",
  EFFECTIVE_DATE: "contractStartDate",
  START_DATE: "contractStartDate",
  END_DATE: "contractEndDate",
  CONTRACT_AMOUNT: "contractAmount",
  CONTRACT_VALUE: "contractAmount",
  CONTRACT_TITLE: "contractTitle",
  PO_NUMBER: "poNumber",
};

function inferVariableValue(
  variableName: string,
  context: IntakeFormVariableContext,
): string {
  const normalized = variableName.trim().toUpperCase();
  const exact = EXACT_VARIABLE_FIELD_MAP[normalized];

  if (exact) {
    return context[exact]?.trim() ?? "";
  }

  if (normalized.includes("COUNTERPARTY") && normalized.includes("NAME")) {
    return context.companyName.trim();
  }

  if (normalized.includes("COUNTERPARTY") && normalized.includes("ADDRESS")) {
    return context.address.trim();
  }

  if (normalized.includes("COUNTERPARTY") && normalized.includes("EMAIL")) {
    return context.mainContactEmail.trim();
  }

  if (normalized.includes("COUNTERPARTY") && normalized.includes("PHONE")) {
    return context.mainContactPhone.trim();
  }

  if (normalized.includes("COUNTERPARTY") && normalized.includes("CONTACT")) {
    return context.mainContactName.trim();
  }

  if (
    normalized.includes("START") ||
    normalized.includes("EFFECTIVE")
  ) {
    return context.contractStartDate.trim();
  }

  if (normalized.includes("END") && normalized.includes("DATE")) {
    return context.contractEndDate.trim();
  }

  if (
    normalized.includes("AMOUNT") ||
    normalized.includes("VALUE") ||
    normalized.includes("PRICE")
  ) {
    return context.contractAmount.trim();
  }

  if (normalized.includes("TITLE")) {
    return context.contractTitle.trim();
  }

  return "";
}

export function buildVariableValuesFromIntakeForm(
  template: ContractTemplateRecord,
  context: IntakeFormVariableContext,
): Record<string, string> {
  const values = buildInitialVariableValues(template);

  for (const variable of template.variables) {
    const inferred = inferVariableValue(variable.name, context);

    if (inferred) {
      values[variable.name] = inferred;
    }
  }

  return values;
}

export function templateMatchesTypeFilter(
  template: ContractTemplateRecord,
  filterType: string,
): boolean {
  if (!filterType) {
    return true;
  }

  return template.contractType === filterType && template.showInIntake;
}

export function templateMatchesSearch(
  template: ContractTemplateRecord,
  query: string,
): boolean {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const haystack = [
    template.title,
    template.description ?? "",
    getContractTypeLabel(template.contractType),
    template.contractType,
    template.fileName,
  ]
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

export function findDefaultTemplateForType(
  templates: ContractTemplateRecord[],
  contractType: ContractTemplateType,
): ContractTemplateRecord | null {
  return (
    templates.find(
      (template) =>
        template.contractType === contractType &&
        template.isDefault &&
        template.isActive &&
        template.showInIntake,
    ) ?? null
  );
}
