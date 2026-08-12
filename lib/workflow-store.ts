import {
  setCachedWorkflowConfig,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowConfig } from "@/lib/workflow-config-types";
import {
  cloneAndNormalizeWorkflowConfig,
} from "@/lib/workflow-store-defaults";
import { getWorkflowConfig } from "@/lib/workflow-config-read";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

const globalStore = globalThis as typeof globalThis & {
  __workflowConfigByOrg?: Map<string, WorkflowConfig>;
};

export async function updateWorkflowConfig(
  config: WorkflowConfig,
  organizationId = DEFAULT_ORGANIZATION_ID,
): Promise<WorkflowConfig> {
  const normalized = cloneAndNormalizeWorkflowConfig(config);

  if (allowMemoryPersistence()) {
    if (!globalStore.__workflowConfigByOrg) {
      globalStore.__workflowConfigByOrg = new Map();
    }

    globalStore.__workflowConfigByOrg.set(organizationId, normalized);

    const { syncNonActiveContractWorkflows } = await import(
      "@/lib/workflow-contract-sync"
    );
    await syncNonActiveContractWorkflows(organizationId);

    return getWorkflowConfig(organizationId);
  }

  const { saveWorkflowConfigToDatabase } = await import("@/lib/platform-data-db");
  await saveWorkflowConfigToDatabase(normalized, organizationId);
  setCachedWorkflowConfig(organizationId, normalized);

  const { syncNonActiveContractWorkflows } = await import(
    "@/lib/workflow-contract-sync"
  );
  await syncNonActiveContractWorkflows(organizationId);

  return cloneAndNormalizeWorkflowConfig(normalized);
}

export {
  getDefaultWorkflowConfig,
  getWorkflowConfig,
} from "@/lib/workflow-config-read";
