import { getCachedWorkflowConfig } from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowConfig } from "@/lib/workflow-config-types";
import {
  cloneAndNormalizeWorkflowConfig,
  getDefaultWorkflowConfig,
} from "@/lib/workflow-store-defaults";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";
import { getWorkflowConfig } from "@/lib/workflow-config-read";

export async function ensureWorkflowConfigLoaded(
  organizationId = DEFAULT_ORGANIZATION_ID,
): Promise<WorkflowConfig> {
  if (allowMemoryPersistence()) {
    return getWorkflowConfig(organizationId);
  }

  const cached = getCachedWorkflowConfig(organizationId);
  if (cached) {
    return cloneAndNormalizeWorkflowConfig(cached);
  }

  const { loadWorkflowSettingsFromDatabase } = await import(
    "@/lib/platform-data-db"
  );
  const settings = await loadWorkflowSettingsFromDatabase(organizationId);
  return settings.config;
}

export { getDefaultWorkflowConfig };
