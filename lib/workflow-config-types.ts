export interface WorkflowStepDefinition {
  id: string;
  name: string;
  role: string;
  assigneeEmail: string;
  assigneeName: string;
  stage: "legal_review" | "vp_review" | "finance_review" | "executive_signoff";
  minAmount?: number;
}

export const BUILT_IN_WORKFLOW_STEP_IDS = [
  "legal",
  "department-vp",
  "finance",
  "executive",
] as const;

export type BuiltInWorkflowStepId = (typeof BUILT_IN_WORKFLOW_STEP_IDS)[number];

export const WORKFLOW_STAGE_OPTIONS: Array<{
  value: WorkflowStepDefinition["stage"];
  label: string;
}> = [
  { value: "legal_review", label: "Legal review" },
  { value: "vp_review", label: "VP review" },
  { value: "finance_review", label: "Finance review" },
  { value: "executive_signoff", label: "Executive sign-off" },
];

export function isBuiltInWorkflowStepId(stepId: string): boolean {
  return BUILT_IN_WORKFLOW_STEP_IDS.includes(stepId as BuiltInWorkflowStepId);
}

export function createCustomWorkflowStep(): WorkflowStepDefinition {
  return {
    id: `approver-${Date.now()}`,
    name: "Additional approval",
    role: "Approver",
    assigneeEmail: "",
    assigneeName: "",
    stage: "vp_review",
  };
}

export interface WorkflowDepartmentApprover {
  department: string;
  assigneeName: string;
  assigneeEmail: string;
}

export interface AgreementTypeRules {
  parentAgreementTypes: string[];
  childAgreementTypes: string[];
}

export interface WorkflowRoutingRule {
  id: string;
  label: string;
  description: string;
  threshold?: number;
}

export interface ContractTypeWorkflowRule {
  contractTypeSlug: string;
  contractTypeLabel: string;
  disabledStepIds: string[];
  routingRuleOverrides: Record<string, number>;
}

export interface WorkflowConfig {
  name: string;
  description: string;
  steps: WorkflowStepDefinition[];
  routingRules: WorkflowRoutingRule[];
  vpDepartmentApprovers: WorkflowDepartmentApprover[];
  agreementTypeRules: AgreementTypeRules;
  contractTypeWorkflowRules: ContractTypeWorkflowRule[];
}

export interface WorkflowPolicy {
  requireAllApprovers: boolean;
  notifyAssigneesByEmail: boolean;
  allowParallelApprovals: boolean;
  autoActivateAfterFinalApproval: boolean;
}

export const defaultWorkflowPolicy: WorkflowPolicy = {
  requireAllApprovers: true,
  notifyAssigneesByEmail: true,
  allowParallelApprovals: false,
  autoActivateAfterFinalApproval: false,
};
