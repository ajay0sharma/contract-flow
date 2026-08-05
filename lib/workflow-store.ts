import {
  setCachedWorkflowConfig,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowConfig } from "@/lib/workflow-config-types";
import {
  cloneAndNormalizeWorkflowConfig,
  getDefaultWorkflowConfig,
} from "@/lib/workflow-store-defaults";
import { getWorkflowConfig } from "@/lib/workflow-config-read";

const globalStore = globalThis as typeof globalThis & {
  __workflowConfig?: WorkflowConfig;
};

export async function updateWorkflowConfig(
  config: WorkflowConfig,
): Promise<WorkflowConfig> {
  const normalized = cloneAndNormalizeWorkflowConfig(config);

  if (allowMemoryPersistence()) {
    globalStore.__workflowConfig = normalized;
    return getWorkflowConfig();
  }

  const { saveWorkflowConfigToDatabase } = await import("@/lib/platform-data-db");
  await saveWorkflowConfigToDatabase(normalized);
  setCachedWorkflowConfig(normalized);
  return cloneAndNormalizeWorkflowConfig(normalized);
}

export { getWorkflowConfig, getDefaultWorkflowConfig } from "@/lib/workflow-config-read";
