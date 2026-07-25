import type { WorkflowPolicy } from "@/lib/workflow-config-types";
import { defaultWorkflowPolicy } from "@/lib/workflow-config-types";

const globalStore = globalThis as typeof globalThis & {
  __workflowPolicy?: WorkflowPolicy;
};

export function getWorkflowPolicy(): WorkflowPolicy {
  if (!globalStore.__workflowPolicy) {
    globalStore.__workflowPolicy = { ...defaultWorkflowPolicy };
  }

  return { ...globalStore.__workflowPolicy };
}

export function updateWorkflowPolicy(
  policy: WorkflowPolicy,
): WorkflowPolicy {
  globalStore.__workflowPolicy = { ...policy };
  return getWorkflowPolicy();
}
