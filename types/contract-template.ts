import type { TemplateVariableFieldType } from "@/lib/generated/prisma/enums";

export type { TemplateVariableFieldType };

/** Slug identifying a contract type (system or custom). */
export type ContractTemplateType = string;

export const CONTRACT_TEMPLATE_TYPES = [
  "vendor",
  "customer",
  "nda",
  "employment",
  "saas",
  "consulting",
  "partnership",
  "other",
] as const;

export type SystemContractTemplateType =
  (typeof CONTRACT_TEMPLATE_TYPES)[number];

export const CONTRACT_TEMPLATE_TYPE_LABELS: Record<
  SystemContractTemplateType,
  string
> = {
  vendor: "Vendor",
  customer: "Customer",
  nda: "NDA",
  employment: "Employment",
  saas: "SaaS",
  consulting: "Consulting",
  partnership: "Partnership",
  other: "Other",
};

export const CONTRACT_TEMPLATE_TYPE_DESCRIPTIONS: Record<
  SystemContractTemplateType,
  string
> = {
  vendor: "Master agreements and vendor/supplier contracts.",
  customer: "Customer SOWs, work orders, and service agreements.",
  nda: "Mutual or one-way non-disclosure agreements.",
  employment: "Employment offers and contractor agreements.",
  saas: "Software subscription and license agreements.",
  consulting: "Professional services and consulting engagements.",
  partnership: "Strategic partnership and reseller agreements.",
  other: "General-purpose or custom agreement templates.",
};

export interface ContractTypeRecord {
  id: string;
  organizationId: string;
  slug: string;
  label: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  showInIntake: boolean;
  isSystem: boolean;
  canBeParentAgreement: boolean;
  requiresParentAgreement: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContractTypeInput {
  organizationId: string;
  label: string;
  description?: string | null;
  createdById: string;
  canBeParentAgreement?: boolean;
  requiresParentAgreement?: boolean;
}

export interface UpdateContractTypeInput {
  label?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  showInIntake?: boolean;
  canBeParentAgreement?: boolean;
  requiresParentAgreement?: boolean;
}

export interface IntakeConfigTypeUpdate {
  id: string;
  showInIntake: boolean;
  displayOrder: number;
}

export interface IntakeConfigTemplateUpdate {
  id: string;
  showInIntake: boolean;
}

export function getContractTypeDescription(
  slug: string,
  types?: ContractTypeRecord[],
): string {
  const match = types?.find((type) => type.slug === slug);
  if (match?.description) {
    return match.description;
  }

  if (slug in CONTRACT_TEMPLATE_TYPE_DESCRIPTIONS) {
    return CONTRACT_TEMPLATE_TYPE_DESCRIPTIONS[
      slug as SystemContractTemplateType
    ];
  }

  return "Custom agreement type configured by your legal team.";
}

export function getContractTypeLabel(
  slug: string,
  types?: ContractTypeRecord[],
): string {
  const match = types?.find((type) => type.slug === slug);
  if (match) {
    return match.label;
  }

  if (slug in CONTRACT_TEMPLATE_TYPE_LABELS) {
    return CONTRACT_TEMPLATE_TYPE_LABELS[
      slug as SystemContractTemplateType
    ];
  }

  return slug
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const TEMPLATE_VARIABLE_FIELD_TYPES = [
  "text",
  "date",
  "number",
  "currency",
  "select",
  "email",
  "yes_no",
] as const satisfies readonly TemplateVariableFieldType[];

export const TEMPLATE_VARIABLE_FIELD_LABELS: Record<
  TemplateVariableFieldType,
  string
> = {
  text: "Text",
  date: "Date",
  number: "Number",
  currency: "Currency",
  select: "Select",
  email: "Email",
  yes_no: "Yes / No",
};

export interface TemplateVariableRecord {
  id: string;
  templateId: string;
  name: string;
  label: string;
  fieldType: TemplateVariableFieldType;
  isRequired: boolean;
  defaultValue: string | null;
  selectOptions: string[];
  helpText: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariableInput {
  name: string;
  label: string;
  fieldType: TemplateVariableFieldType;
  isRequired?: boolean;
  defaultValue?: string | null;
  selectOptions?: string[];
  helpText?: string | null;
  displayOrder: number;
}

export interface ContractTemplateRecord {
  id: string;
  organizationId: string;
  title: string;
  contractType: ContractTemplateType;
  description: string | null;
  fileName: string;
  storagePath: string;
  fileSize: number;
  version: number;
  isActive: boolean;
  showInIntake: boolean;
  isDefault: boolean;
  uploadedById: string;
  uploadedAt: string;
  lastUpdatedById: string;
  createdAt: string;
  updatedAt: string;
  variables: TemplateVariableRecord[];
}

export interface ContractTemplateVersionRecord {
  id: string;
  templateId: string;
  version: number;
  fileName: string;
  storagePath: string;
  fileSize: number;
  uploadedById: string;
  uploadedAt: string;
  changeNote: string | null;
}

export interface TemplateVersionHistoryEntry extends ContractTemplateVersionRecord {
  isCurrent: boolean;
}

export const DOWNLOAD_LINK_ERROR_MESSAGE =
  "Unable to generate download link — please try again or contact support";

export interface TemplateFileReference {
  fileName: string;
  storagePath: string;
  fileSize: number;
  version: number;
}

export interface UploadedTemplateFile {
  fileName: string;
  storagePath: string;
  fileSize: number;
}

export interface TemplateDefaultChange {
  id: string;
  title: string;
}

export interface TemplateMutationResult {
  template: ContractTemplateRecord;
  previousDefault: TemplateDefaultChange | null;
  versionUploaded: boolean;
  placeholderWarning: string | null;
}

export interface CreateContractTemplateInput {
  id?: string;
  organizationId: string;
  title: string;
  contractType: ContractTemplateType;
  description?: string | null;
  file: UploadedTemplateFile;
  variables: TemplateVariableInput[];
  isActive?: boolean;
  showInIntake?: boolean;
  isDefault?: boolean;
  uploadedById: string;
}

export interface UpdateContractTemplateInput {
  title?: string;
  contractType?: ContractTemplateType;
  description?: string | null;
  file?: UploadedTemplateFile;
  variables?: TemplateVariableInput[];
  isActive?: boolean;
  showInIntake?: boolean;
  isDefault?: boolean;
  changeNote?: string | null;
  lastUpdatedById: string;
}
