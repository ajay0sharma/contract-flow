export type {
  WorkflowConfig,
  WorkflowRoutingRule,
  WorkflowStepDefinition,
} from "@/lib/workflow-config-types";

export {
  getDefaultWorkflowConfig,
  getWorkflowConfig,
} from "@/lib/workflow-config-read";

export { updateWorkflowConfig } from "@/lib/workflow-store";
