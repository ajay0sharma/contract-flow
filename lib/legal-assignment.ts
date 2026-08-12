import { isLegalEmail } from "@/lib/legal-access";
import { assignLegalReviewerStep, getCurrentApprover } from "@/lib/workflow-engine";
import type {
  ContractLifecycleStatus,
  ContractRecord,
  ContractStage,
  WorkflowStep,
} from "@/types/contract";


function deriveContractStatusForQueue(
  stage: ContractStage,
): ContractLifecycleStatus {
  if (stage === "active") {
    return "active";
  }

  if (stage === "rejected") {
    return "rejected";
  }

  if (stage === "expired") {
    return "expired";
  }

  if (stage === "request") {
    return "draft";
  }

  return "pending";
}

export function isPendingReviewContract(contract: ContractRecord): boolean {
  const contractStatus =
    contract.contractStatus ?? deriveContractStatusForQueue(contract.stage);

  return (
    (contractStatus === "draft" || contractStatus === "pending") &&
    contract.stage !== "awaiting_signature"
  );
}

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

export function prepareContractForWorkflowAction(
  contract: ContractRecord,
  actor: { email: string; name: string },
  action: "approve" | "reject",
): ContractRecord {
  if (!isAwaitingLegalPickup(contract)) {
    return contract;
  }

  if (!isLegalEmail(actor.email)) {
    throw new Error(
      `This contract has not been picked up yet. Assign a legal owner before ${action === "approve" ? "approving" : "rejecting"}.`,
    );
  }

  return assignLegalReviewerStep(
    contract,
    { email: actor.email, name: actor.name },
    actor,
  );
}

export function isOwnedByLegalUser(
  contract: ContractRecord,
  email: string,
): boolean {
  const legalStep = getLegalReviewStep(contract);
  const normalizedEmail = email.trim().toLowerCase();

  if (!legalStep?.assigneeEmail.trim() || !normalizedEmail) {
    return false;
  }

  return legalStep.assigneeEmail.trim().toLowerCase() === normalizedEmail;
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
