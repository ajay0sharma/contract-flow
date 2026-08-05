import {
  setCachedWorkflowPolicy,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowPolicy } from "@/lib/workflow-config-types";
import { getWorkflowPolicy } from "@/lib/workflow-policy-read";

export { getWorkflowPolicy } from "@/lib/workflow-policy-read";

export async function updateWorkflowPolicy(
  policy: WorkflowPolicy,
): Promise<WorkflowPolicy> {
  const nextPolicy = { ...policy };

  if (allowMemoryPersistence()) {
    const globalStore = globalThis as typeof globalThis & {
      __workflowPolicy?: WorkflowPolicy;
    };
    globalStore.__workflowPolicy = nextPolicy;
    return getWorkflowPolicy();
  }

  const { saveWorkflowPolicyToDatabase } = await import("@/lib/platform-data-db");
  await saveWorkflowPolicyToDatabase(nextPolicy);
  setCachedWorkflowPolicy(nextPolicy);
  return getWorkflowPolicy();
}
