import { resolveWorkflowSteps } from "@/lib/workflow-engine";
import { getWorkflowConfig } from "@/lib/workflow-config-read";
import type {
  ContractRecord,
  ContractStage,
  WorkflowStep,
} from "@/types/contract";

const IN_PROGRESS_APPROVAL_STAGES = new Set<ContractStage>([
  "request",
  "legal_review",
  "vp_review",
  "finance_review",
  "executive_signoff",
]);

const TERMINAL_WORKFLOW_STAGES = new Set<ContractStage>([
  "active",
  "awaiting_signature",
  "rejected",
  "expired",
]);

export function shouldSyncContractWorkflow(contract: ContractRecord): boolean {
  return IN_PROGRESS_APPROVAL_STAGES.has(contract.stage);
}

function resolveWorkflowStepTemplate(
  contract: ContractRecord,
  organizationId: string,
): WorkflowStep[] {
  return resolveWorkflowSteps(
    contract.amountNumeric,
    contract.department,
    contract.contractType,
    organizationId,
  ).map((step) => ({
    ...step,
    status: "upcoming" as const,
    completedAt: undefined,
    assignedAt: step.id === "legal" ? undefined : step.assignedAt,
  }));
}

function resolveCurrentStepIndex(
  workflowSteps: WorkflowStep[],
  fallback: number,
): number {
  const currentIndex = workflowSteps.findIndex((step) => step.status === "current");

  if (currentIndex >= 0) {
    return currentIndex;
  }

  const upcomingIndex = workflowSteps.findIndex(
    (step) => step.status === "upcoming",
  );

  if (upcomingIndex >= 0) {
    return upcomingIndex;
  }

  return Math.min(Math.max(fallback, 0), Math.max(workflowSteps.length - 1, 0));
}

function resolveStageForCurrentStep(
  workflowSteps: WorkflowStep[],
  organizationId: string,
  fallback: ContractStage,
): ContractStage {
  const currentStep = workflowSteps.find((step) => step.status === "current");

  if (!currentStep) {
    return fallback;
  }

  const definition = getWorkflowConfig(organizationId).steps.find(
    (step) => step.id === currentStep.id,
  );

  return definition?.stage ?? fallback;
}

function shouldPreserveAssignee(
  stepId: string,
  existing: WorkflowStep,
): boolean {
  return (
    existing.status === "completed" ||
    existing.status === "rejected" ||
    (stepId === "legal" && existing.assigneeEmail.trim().length > 0)
  );
}

export function reconcileContractWorkflowWithConfig(
  contract: ContractRecord,
  organizationId: string,
): ContractRecord {
  if (!shouldSyncContractWorkflow(contract)) {
    return contract;
  }

  const template = resolveWorkflowStepTemplate(contract, organizationId);
  const existingById = new Map(
    contract.workflowSteps.map((step) => [step.id, step]),
  );

  const workflowSteps = template.map((step) => {
    const existing = existingById.get(step.id);

    if (!existing) {
      return step;
    }

    const keepAssignee = shouldPreserveAssignee(step.id, existing);

    return {
      ...step,
      status: existing.status,
      completedAt: existing.completedAt,
      assignedAt: existing.assignedAt,
      assigneeEmail: keepAssignee ? existing.assigneeEmail : step.assigneeEmail,
      assigneeName: keepAssignee ? existing.assigneeName : step.assigneeName,
    };
  });

  const stage = TERMINAL_WORKFLOW_STAGES.has(contract.stage)
    ? contract.stage
    : resolveStageForCurrentStep(
        workflowSteps,
        organizationId,
        contract.stage,
      );

  return {
    ...contract,
    workflowSteps,
    currentStepIndex: resolveCurrentStepIndex(
      workflowSteps,
      contract.currentStepIndex,
    ),
    stage,
    updatedAt: new Date().toISOString(),
  };
}

export function contractWorkflowNeedsSync(
  before: ContractRecord,
  after: ContractRecord,
): boolean {
  return (
    before.currentStepIndex !== after.currentStepIndex ||
    before.stage !== after.stage ||
    JSON.stringify(before.workflowSteps) !== JSON.stringify(after.workflowSteps)
  );
}
