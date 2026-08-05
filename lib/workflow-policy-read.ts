import {
  getCachedWorkflowPolicy,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { WorkflowPolicy } from "@/lib/workflow-config-types";
import { defaultWorkflowPolicy } from "@/lib/workflow-config-types";

const globalStore = globalThis as typeof globalThis & {
  __workflowPolicy?: WorkflowPolicy;
};

export function getWorkflowPolicy(): WorkflowPolicy {
  if (allowMemoryPersistence()) {
    if (!globalStore.__workflowPolicy) {
      globalStore.__workflowPolicy = { ...defaultWorkflowPolicy };
    }

    return { ...globalStore.__workflowPolicy };
  }

  const cached = getCachedWorkflowPolicy();
  return { ...(cached ?? defaultWorkflowPolicy) };
}
