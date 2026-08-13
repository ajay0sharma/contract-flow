import {
  getCachedWorkflowConfig,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowConfig } from "@/lib/workflow-config-types";
import {
  cloneAndNormalizeWorkflowConfig,
  getDefaultWorkflowConfig,
} from "@/lib/workflow-store-defaults";
import { resolveWorkflowOrganizationId } from "@/lib/workflow-organization";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

const globalStore = globalThis as typeof globalThis & {
  __workflowConfigByOrg?: Map<string, WorkflowConfig>;
};

function getMemoryStore(organizationId: string): WorkflowConfig {
  if (!globalStore.__workflowConfigByOrg) {
    globalStore.__workflowConfigByOrg = new Map();
  }

  const existing = globalStore.__workflowConfigByOrg.get(organizationId);

  if (!existing) {
    globalStore.__workflowConfigByOrg.set(
      organizationId,
      getDefaultWorkflowConfig(),
    );
  }

  return cloneAndNormalizeWorkflowConfig(
    globalStore.__workflowConfigByOrg.get(organizationId)!,
  );
}

export function getWorkflowConfig(
  organizationId = DEFAULT_ORGANIZATION_ID,
): WorkflowConfig {
  const resolvedOrganizationId = resolveWorkflowOrganizationId(organizationId);

  if (allowMemoryPersistence()) {
    return getMemoryStore(resolvedOrganizationId);
  }

  const cached = getCachedWorkflowConfig(resolvedOrganizationId);
  if (cached) {
    return cloneAndNormalizeWorkflowConfig(cached);
  }

  return getDefaultWorkflowConfig();
}

export { getDefaultWorkflowConfig } from "@/lib/workflow-store-defaults";
