import {
  setCachedWorkflowPolicy,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowPolicy } from "@/lib/workflow-config-types";
import { getWorkflowPolicy } from "@/lib/workflow-policy-read";
import { normalizeWorkflowPolicy } from "@/lib/workflow-policy-normalize";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

export { getWorkflowPolicy } from "@/lib/workflow-policy-read";

export async function updateWorkflowPolicy(
  policy: WorkflowPolicy,
  organizationId = DEFAULT_ORGANIZATION_ID,
): Promise<WorkflowPolicy> {
  const nextPolicy = normalizeWorkflowPolicy(policy);

  if (allowMemoryPersistence()) {
    const globalStore = globalThis as typeof globalThis & {
      __workflowPolicyByOrg?: Map<string, WorkflowPolicy>;
    };

    if (!globalStore.__workflowPolicyByOrg) {
      globalStore.__workflowPolicyByOrg = new Map();
    }

    globalStore.__workflowPolicyByOrg.set(organizationId, nextPolicy);
    return getWorkflowPolicy(organizationId);
  }

  const { saveWorkflowPolicyToDatabase } = await import("@/lib/platform-data-db");
  await saveWorkflowPolicyToDatabase(nextPolicy, organizationId);
  setCachedWorkflowPolicy(organizationId, nextPolicy);
  return getWorkflowPolicy(organizationId);
}
