import { getCachedWorkflowPolicy } from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowPolicy } from "@/lib/workflow-config-types";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";
import { getWorkflowPolicy } from "@/lib/workflow-policy-read";

export async function ensureWorkflowPolicyLoaded(
  organizationId = DEFAULT_ORGANIZATION_ID,
): Promise<WorkflowPolicy> {
  if (allowMemoryPersistence()) {
    return getWorkflowPolicy(organizationId);
  }

  const cached = getCachedWorkflowPolicy(organizationId);
  if (cached) {
    return { ...cached };
  }

  const { loadWorkflowSettingsFromDatabase } = await import(
    "@/lib/platform-data-db"
  );
  const settings = await loadWorkflowSettingsFromDatabase(organizationId);
  return settings.policy;
}
