import type { IntakeFormSectionInput } from "@/types/intake-form";

export const INTAKE_SYSTEM_SECTION_KEYS = [
  "company_configuration",
  "requester_information",
  "contract_details",
  "supporting_documents",
  "counterparty_information",
] as const;

export type IntakeSystemSectionKey =
  (typeof INTAKE_SYSTEM_SECTION_KEYS)[number];

export function buildDefaultIntakeFormSections(): IntakeFormSectionInput[] {
  return [
    {
      key: "company_configuration",
      label: "Company configuration",
      description:
        "Department and contract type options change based on the selected company profile.",
      displayOrder: 0,
      isSystem: true,
      fields: [
        {
          key: "companyProfile",
          label: "Company profile",
          fieldType: "select",
          isRequired: true,
          isSystem: true,
          displayOrder: 0,
        },
      ],
    },
    {
      key: "requester_information",
      label: "Requester information",
      displayOrder: 1,
      isSystem: true,
      fields: [
        {
          key: "requesterName",
          label: "Requester name",
          fieldType: "text",
          isRequired: true,
          isSystem: true,
          displayOrder: 0,
          helpText: "Auto-filled from your signed-in account.",
        },
        {
          key: "department",
          label: "Department",
          fieldType: "select",
          isRequired: true,
          isSystem: true,
          displayOrder: 1,
        },
      ],
    },
    {
      key: "contract_details",
      label: "Contract details",
      displayOrder: 2,
      isSystem: true,
      fields: [
        {
          key: "parentAgreementId",
          label: "Parent agreement",
          fieldType: "text",
          isRequired: true,
          isSystem: true,
          displayOrder: 0,
          helpText:
            "Required for child agreements. Search by record ID, title, counterparty, or agreement type.",
        },
        {
          key: "contractStartDate",
          label: "Contract start date",
          fieldType: "date",
          isRequired: true,
          isSystem: true,
          displayOrder: 1,
        },
        {
          key: "contractEndDate",
          label: "Contract end date",
          fieldType: "date",
          isRequired: true,
          isSystem: true,
          displayOrder: 2,
        },
        {
          key: "contractTitle",
          label: "Contract title",
          fieldType: "text",
          isRequired: true,
          isSystem: true,
          displayOrder: 3,
          placeholder: "Master Services Agreement — Acme Corp",
        },
        {
          key: "contractAmount",
          label: "Contract amount",
          fieldType: "currency",
          isRequired: false,
          isSystem: true,
          displayOrder: 4,
          helpText: "Optional. Leave blank for agreements without a dollar value.",
          placeholder: "$240,000",
        },
        {
          key: "budgeted",
          label: "Budgeted?",
          fieldType: "yes_no",
          isRequired: false,
          isSystem: true,
          displayOrder: 5,
          helpText: "Required when a contract amount is entered.",
        },
        {
          key: "poNumber",
          label: "PO number",
          fieldType: "text",
          isRequired: false,
          isSystem: true,
          displayOrder: 6,
          placeholder: "PO-2026-11842",
        },
        {
          key: "contractDescription",
          label: "Contract description",
          fieldType: "text",
          isRequired: true,
          isSystem: true,
          displayOrder: 7,
          placeholder: "Brief summary of scope, deliverables, and key terms.",
        },
        {
          key: "otherNotes",
          label: "Other notes",
          fieldType: "text",
          isRequired: false,
          isSystem: true,
          displayOrder: 8,
          placeholder: "Optional context for approvers.",
        },
      ],
    },
    {
      key: "supporting_documents",
      label: "Supporting documents",
      description:
        "Optionally attach one or more documents. The uploaded file name becomes the attachment title on the contract record.",
      displayOrder: 3,
      isSystem: true,
      fields: [
        {
          key: "attachments",
          label: "Attachments",
          fieldType: "text",
          isRequired: false,
          isSystem: true,
          displayOrder: 0,
        },
      ],
    },
    {
      key: "counterparty_information",
      label: "Counterparty information",
      description:
        "Choose a saved counterparty profile or create a new one for this request.",
      displayOrder: 4,
      isSystem: true,
      fields: [
        {
          key: "counterpartyProfile",
          label: "Counterparty",
          fieldType: "select",
          isRequired: true,
          isSystem: true,
          displayOrder: 0,
        },
        {
          key: "companyName",
          label: "Company name",
          fieldType: "text",
          isRequired: true,
          isSystem: true,
          displayOrder: 1,
          placeholder: "Acme Corp",
        },
        {
          key: "mainContactName",
          label: "Primary contact name",
          fieldType: "text",
          isRequired: false,
          isSystem: true,
          displayOrder: 2,
        },
        {
          key: "mainContactTitle",
          label: "Primary contact title",
          fieldType: "text",
          isRequired: false,
          isSystem: true,
          displayOrder: 3,
        },
        {
          key: "mainContactEmail",
          label: "Primary contact email",
          fieldType: "email",
          isRequired: true,
          isSystem: true,
          displayOrder: 4,
        },
        {
          key: "mainContactPhone",
          label: "Primary contact phone",
          fieldType: "text",
          isRequired: false,
          isSystem: true,
          displayOrder: 5,
        },
        {
          key: "address",
          label: "Address",
          fieldType: "text",
          isRequired: false,
          isSystem: true,
          displayOrder: 6,
        },
      ],
    },
  ];
}

export function slugifyIntakeKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return base || "field";
}

export function makeUniqueIntakeKey(
  label: string,
  existingKeys: string[],
): string {
  const base = slugifyIntakeKey(label);
  let candidate = base;
  let index = 2;

  while (existingKeys.includes(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }

  return candidate;
}
