import { getAllowedOrganizationIds } from "@/lib/clause-library-org";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

const LEGACY_WORKFLOW_ORGANIZATION_IDS = new Set(["seed-org-001"]);

export function resolveWorkflowOrganizationId(
  organizationId?: string | null,
): string {
  const normalized = organizationId?.trim() || DEFAULT_ORGANIZATION_ID;

  if (LEGACY_WORKFLOW_ORGANIZATION_IDS.has(normalized)) {
    return DEFAULT_ORGANIZATION_ID;
  }

  const allowed = new Set(getAllowedOrganizationIds());

  if (allowed.has(normalized)) {
    return normalized;
  }

  return DEFAULT_ORGANIZATION_ID;
}
