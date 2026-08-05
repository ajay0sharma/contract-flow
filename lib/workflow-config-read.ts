import {
  getCachedWorkflowConfig,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowConfig } from "@/lib/workflow-config-types";
import {
  cloneAndNormalizeWorkflowConfig,
  getDefaultWorkflowConfig,
} from "@/lib/workflow-store-defaults";

const globalStore = globalThis as typeof globalThis & {
  __workflowConfig?: WorkflowConfig;
};

function getMemoryStore(): WorkflowConfig {
  if (!globalStore.__workflowConfig) {
    globalStore.__workflowConfig = getDefaultWorkflowConfig();
  }

  return cloneAndNormalizeWorkflowConfig(globalStore.__workflowConfig);
}

export function getWorkflowConfig(): WorkflowConfig {
  if (allowMemoryPersistence()) {
    return getMemoryStore();
  }

  const cached = getCachedWorkflowConfig();
  if (cached) {
    return cloneAndNormalizeWorkflowConfig(cached);
  }

  return getDefaultWorkflowConfig();
}

export { getDefaultWorkflowConfig } from "@/lib/workflow-store-defaults";
