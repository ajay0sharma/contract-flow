export interface WorkflowStepDefinition {
  id: string;
  name: string;
  role: string;
  assigneeEmail: string;
  assigneeName: string;
  stage: "legal_review" | "vp_review" | "finance_review" | "executive_signoff";
  minAmount?: number;
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
