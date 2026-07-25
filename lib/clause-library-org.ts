import { getAvailableCompanyConfigs } from "@/lib/company-config";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

export function getAllowedOrganizationIds(): string[] {
  return getAvailableCompanyConfigs().map((config) => config.id);
}

export function resolveClauseLibraryOrganizationId(
  requested?: string | null,
): string {
  const allowed = new Set(getAllowedOrganizationIds());
  const normalized = requested?.trim();

  if (normalized && allowed.has(normalized)) {
    return normalized;
  }

  return DEFAULT_ORGANIZATION_ID;
}

export function belongsToOrganization(
  organizationId: string,
  expectedOrganizationId: string,
): boolean {
  return organizationId === expectedOrganizationId;
}
