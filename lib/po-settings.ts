import type { PoAuthType, PoProvider } from "@/lib/generated/prisma/enums";

export type PoProviderOptionId = Exclude<PoProvider, "manual">;

export interface PoProviderOption {
  id: PoProviderOptionId;
  name: string;
  description: string;
  defaultAuthType: PoAuthType;
  defaultDisplayName: string;
  baseUrlPlaceholder: string;
}

export const PO_PROVIDER_OPTIONS: PoProviderOption[] = [
  {
    id: "coupa",
    name: "Coupa",
    description: "Coupa Procurement Platform",
    defaultAuthType: "api_key",
    defaultDisplayName: "Coupa",
    baseUrlPlaceholder: "https://yourcompany.coupahost.com",
  },
  {
    id: "sap",
    name: "SAP",
    description: "SAP MM / Ariba",
    defaultAuthType: "basic_auth",
    defaultDisplayName: "SAP",
    baseUrlPlaceholder: "https://yourserver:8000",
  },
  {
    id: "prendio",
    name: "Prendio",
    description: "Prendio Procurement",
    defaultAuthType: "api_key",
    defaultDisplayName: "Prendio",
    baseUrlPlaceholder: "https://app.prendio.com",
  },
  {
    id: "netsuite",
    name: "NetSuite",
    description: "Oracle NetSuite",
    defaultAuthType: "oauth2",
    defaultDisplayName: "NetSuite",
    baseUrlPlaceholder:
      "https://[accountid].suitetalk.api.netsuite.com",
  },
  {
    id: "oracle",
    name: "Oracle",
    description: "Oracle Fusion / ERP Cloud",
    defaultAuthType: "basic_auth",
    defaultDisplayName: "Oracle",
    baseUrlPlaceholder: "https://yourserver.fa.us2.oraclecloud.com",
  },
  {
    id: "other",
    name: "Other",
    description: "Custom REST API integration",
    defaultAuthType: "api_key",
    defaultDisplayName: "PO system",
    baseUrlPlaceholder: "https://your-po-system.com/api",
  },
];

export const PO_AUTH_TYPE_OPTIONS: Array<{
  value: PoAuthType;
  label: string;
}> = [
  { value: "api_key", label: "API Key" },
  { value: "oauth2", label: "OAuth 2.0" },
  { value: "basic_auth", label: "Basic Auth" },
];

export const PO_MAPPING_TARGETS: Array<{
  value: string;
  label: string;
}> = [
  { value: "poNumber", label: "PO Number" },
  { value: "vendor", label: "Company name" },
  { value: "amount", label: "Contract amount" },
  { value: "currency", label: "Currency" },
  { value: "description", label: "Business purpose" },
  { value: "department", label: "Department" },
  { value: "costCenter", label: "Cost center" },
];

export interface PoFieldMappingRow {
  id: string;
  sourceField: string;
  targetField: string;
}

export const DEFAULT_FIELD_MAPPING_ROWS: Omit<PoFieldMappingRow, "id">[] = [
  { sourceField: "po_number", targetField: "poNumber" },
  { sourceField: "vendor_name", targetField: "vendor" },
  { sourceField: "total_amount", targetField: "amount" },
  { sourceField: "currency", targetField: "currency" },
  { sourceField: "description", targetField: "description" },
  { sourceField: "department", targetField: "department" },
  { sourceField: "cost_center", targetField: "costCenter" },
];

export function getProviderOption(
  provider: PoProvider | "",
): PoProviderOption | undefined {
  if (!provider || provider === "manual") {
    return undefined;
  }

  return PO_PROVIDER_OPTIONS.find((option) => option.id === provider);
}

export function fieldMappingsToRows(
  mappings: Record<string, string> | null | undefined,
): PoFieldMappingRow[] {
  if (!mappings || Object.keys(mappings).length === 0) {
    return DEFAULT_FIELD_MAPPING_ROWS.map((row, index) => ({
      ...row,
      id: `default-${index}`,
    }));
  }

  return Object.entries(mappings).map(([sourceField, targetField], index) => ({
    id: `mapping-${index}`,
    sourceField,
    targetField,
  }));
}

export function rowsToFieldMappings(
  rows: PoFieldMappingRow[],
): Record<string, string> {
  const mappings: Record<string, string> = {};

  for (const row of rows) {
    const source = row.sourceField.trim();
    const target = row.targetField.trim();

    if (source && target) {
      mappings[source] = target;
    }
  }

  return mappings;
}
