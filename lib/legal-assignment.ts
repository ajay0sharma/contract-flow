import { getCurrentApprover } from "@/lib/workflow-engine";
import type { ContractRecord, WorkflowStep } from "@/types/contract";

export function getLegalReviewStep(
  contract: ContractRecord,
): WorkflowStep | undefined {
  return contract.workflowSteps.find((step) => step.id === "legal");
}

export function isLegalReviewUnassigned(contract: ContractRecord): boolean {
  const legalStep = getLegalReviewStep(contract);

  if (!legalStep) {
    return false;
  }

  return !legalStep.assigneeEmail.trim();
}

export function isAwaitingLegalPickup(contract: ContractRecord): boolean {
  if (contract.stage !== "legal_review") {
    return false;
  }

  const current = getCurrentApprover(contract);

  return current?.id === "legal" && isLegalReviewUnassigned(contract);
}

export function getLegalOwnerDisplay(contract: ContractRecord): {
  label: string;
  unassigned: boolean;
} {
  const legalStep = getLegalReviewStep(contract);

  if (!legalStep) {
    return { label: "—", unassigned: false };
  }

  if (!legalStep.assigneeEmail.trim()) {
    return { label: "Unassigned", unassigned: true };
  }

  return {
    label: legalStep.assigneeName.trim() || legalStep.assigneeEmail,
    unassigned: false,
  };
}
