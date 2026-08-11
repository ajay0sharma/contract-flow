import {
  getCachedWorkflowPolicy,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowPolicy } from "@/lib/workflow-config-types";
import { defaultWorkflowPolicy } from "@/lib/workflow-config-types";
import { normalizeWorkflowPolicy } from "@/lib/workflow-policy-normalize";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

const globalStore = globalThis as typeof globalThis & {
  __workflowPolicyByOrg?: Map<string, WorkflowPolicy>;
};

export function getWorkflowPolicy(
  organizationId = DEFAULT_ORGANIZATION_ID,
): WorkflowPolicy {
  if (allowMemoryPersistence()) {
    if (!globalStore.__workflowPolicyByOrg) {
      globalStore.__workflowPolicyByOrg = new Map();
    }

    const existing = globalStore.__workflowPolicyByOrg.get(organizationId);

    if (!existing) {
      globalStore.__workflowPolicyByOrg.set(organizationId, {
        ...defaultWorkflowPolicy,
      });
    }

    return normalizeWorkflowPolicy(
      globalStore.__workflowPolicyByOrg.get(organizationId)!,
    );
  }

  const cached = getCachedWorkflowPolicy(organizationId);
  return normalizeWorkflowPolicy(cached ?? defaultWorkflowPolicy);
}
