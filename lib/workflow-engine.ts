import { isPopulated, safeTrim } from "@/lib/string-utils";
import { createIntakeAttachmentVersionFields } from "@/lib/contract-attachment-versions";
import { getIntakeDocumentTypeLabel } from "@/lib/intake-documents";
import { getWorkflowConfig } from "@/lib/workflow-config-read";
import { resolveWorkflowConfigForContractType } from "@/lib/workflow-config-resolve";
import { getWorkflowPolicy } from "@/lib/workflow-policy-read";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";
import type {
  AuditEvent,
  ContractIntakeInput,
  ContractRecord,
  ContractStage,
  WorkflowStep,
} from "@/types/contract";

export function parseContractAmount(value: string | undefined | null): number {
  const cleaned = safeTrim(value).replace(/[^0-9.]/g, "");
  return Number(cleaned) || 0;
}

export function resolveWorkflowSteps(
  amount: number,
  department?: string,
  contractType?: string,
  organizationId = DEFAULT_ORGANIZATION_ID,
): WorkflowStep[] {
  const baseConfig = getWorkflowConfig(organizationId);
  const workflowConfig = resolveWorkflowConfigForContractType(
    baseConfig,
    contractType,
  );
  const departmentVpApprover = workflowConfig.vpDepartmentApprovers.find(
    (approver) => approver.department === department,
  );

  const policy = getWorkflowPolicy(organizationId);

  return workflowConfig.steps
    .filter((step) => !step.minAmount || amount >= step.minAmount)
    .map((step, index) => ({
      id: step.id,
      name:
        step.id === "department-vp" && department
          ? `${department} VP Approval`
          : step.name,
      role: step.role,
      assigneeEmail:
        step.id === "legal"
          ? ""
          : step.id === "department-vp"
            ? departmentVpApprover?.assigneeEmail ?? step.assigneeEmail
            : step.assigneeEmail,
      assigneeName:
        step.id === "legal"
          ? ""
          : step.id === "department-vp"
            ? departmentVpApprover?.assigneeName ?? step.assigneeName
            : step.assigneeName,
      status: policy.allowParallelApprovals
        ? ("current" as const)
        : index === 0
          ? ("current" as const)
          : ("upcoming" as const),
      assignedAt:
        step.id === "legal"
          ? undefined
          : policy.allowParallelApprovals || index === 0
            ? nowIsoTimestamp()
            : undefined,
    }));
}

export function formatStageLabel(stage: ContractStage): string {
  const labels: Record<ContractStage, string> = {
    request: "Request",
    legal_review: "Legal Review",
    vp_review: "VP Review",
    finance_review: "Finance Review",
    executive_signoff: "Executive Sign-off",
    awaiting_signature: "Awaiting Signature",
    active: "Active",
    expired: "Expired",
    rejected: "Rejected",
  };

  return labels[stage];
}

export function getCurrentApprover(
  contract: ContractRecord,
): WorkflowStep | null {
  const activeSteps = getActiveApprovalSteps(contract);

  if (activeSteps.length > 0) {
    return activeSteps[0];
  }

  const indexedStep = contract.workflowSteps[contract.currentStepIndex];

  if (indexedStep?.status === "current") {
    return indexedStep;
  }

  return null;
}

export function getActiveApprovalSteps(contract: ContractRecord): WorkflowStep[] {
  return contract.workflowSteps.filter((step) => step.status === "current");
}

export function isAwaitingApproval(contract: ContractRecord): boolean {
  return !["active", "rejected", "awaiting_signature", "request"].includes(
    contract.stage,
  );
}

function nowIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowIsoTimestamp(): string {
  return new Date().toISOString();
}

function createAuditEvent(
  actorName: string,
  actorEmail: string,
  action: string,
  detail: string,
): AuditEvent {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: nowIsoTimestamp(),
    actorName,
    actorEmail,
    action,
    detail,
  };
}

function stageForStep(
  step: WorkflowStep | undefined,
  organizationId = DEFAULT_ORGANIZATION_ID,
): ContractStage {
  const definition = getWorkflowConfig(organizationId).steps.find(
    (item) => item.id === step?.id,
  );
  return definition?.stage ?? "legal_review";
}

function resolveContractPolicy(contract: ContractRecord) {
  return getWorkflowPolicy(contract.companyProfileId);
}

function stampCurrentStep(step: WorkflowStep): WorkflowStep {
  if (step.id === "legal" && !step.assigneeEmail.trim()) {
    return step;
  }

  return {
    ...step,
    assignedAt: step.assignedAt ?? nowIsoTimestamp(),
  };
}

function findLegalStep(
  workflowSteps: WorkflowStep[],
): WorkflowStep | undefined {
  return workflowSteps.find((step) => step.id === "legal");
}

function hasBlockingUnassignedLegal(contract: ContractRecord): boolean {
  const legalStep = contract.workflowSteps.find(
    (step) => step.id === "legal" && step.status === "current",
  );

  return Boolean(legalStep && !legalStep.assigneeEmail.trim());
}

function finalizeApprovedContract(
  contract: ContractRecord,
  workflowSteps: WorkflowStep[],
  policy: ReturnType<typeof getWorkflowPolicy>,
  auditTrail: AuditEvent[],
): ContractRecord {
  auditTrail.push(
    createAuditEvent(
      "Workflow Engine",
      "system@contract-app.local",
      "Approved for execution",
      policy.autoActivateAfterFinalApproval
        ? "All required approvals completed. Contract activated automatically."
        : "All required approvals completed. Contract is ready for signature.",
    ),
  );

  return {
    ...contract,
    workflowSteps,
    currentStepIndex: workflowSteps.length,
    stage: policy.autoActivateAfterFinalApproval ? "active" : "awaiting_signature",
    auditTrail,
    updatedAt: nowIsoTimestamp(),
  };
}

function completeSequentialApproval(
  contract: ContractRecord,
  approverEmail: string,
  approverName: string,
  note: string | undefined,
  policy: ReturnType<typeof getWorkflowPolicy>,
): ContractRecord {
  const currentStep = contract.workflowSteps[contract.currentStepIndex];

  if (!currentStep || currentStep.status !== "current") {
    throw new Error("No pending approval step.");
  }

  if (!currentStep.assigneeEmail.trim()) {
    throw new Error(
      "This contract has not been picked up yet. Assign a legal owner before approving.",
    );
  }

  if (currentStep.assigneeEmail.toLowerCase() !== approverEmail.toLowerCase()) {
    throw new Error("You are not assigned to the current approval step.");
  }

  const completedSteps = contract.workflowSteps.map((step, index) => {
    if (index !== contract.currentStepIndex) {
      return step;
    }

    return {
      ...step,
      status: "completed" as const,
      completedAt: nowIsoDate(),
      note,
    };
  });

  const nextIndex = contract.currentStepIndex + 1;
  const hasNextStep = nextIndex < completedSteps.length;
  const nextSteps = completedSteps.map((step, index) => {
    if (hasNextStep && index === nextIndex) {
      return stampCurrentStep({ ...step, status: "current" as const });
    }

    return step;
  });

  const auditTrail = [
    ...contract.auditTrail,
    createAuditEvent(
      approverName,
      approverEmail,
      "Approved",
      `${currentStep.name} completed${note ? `: ${note}` : "."}`,
    ),
  ];

  if (hasNextStep) {
    const nextStep = nextSteps[nextIndex];

    auditTrail.push(
      createAuditEvent(
        "Workflow Engine",
        "system@contract-app.local",
        "Routed",
        `Contract sent to ${nextStep.name} (${nextStep.assigneeName}).`,
      ),
    );

    return {
      ...contract,
      workflowSteps: nextSteps,
      currentStepIndex: nextIndex,
      stage: stageForStep(nextStep, contract.companyProfileId),
      auditTrail,
      updatedAt: nowIsoTimestamp(),
    };
  }

  if (hasBlockingUnassignedLegal(contract)) {
    throw new Error(
      "Legal review must be assigned and completed before final approval.",
    );
  }

  return finalizeApprovedContract(contract, nextSteps, policy, auditTrail);
}

function completeParallelApproval(
  contract: ContractRecord,
  approverEmail: string,
  approverName: string,
  note: string | undefined,
  policy: ReturnType<typeof getWorkflowPolicy>,
): ContractRecord {
  const stepIndex = contract.workflowSteps.findIndex(
    (step) =>
      step.status === "current" &&
      step.assigneeEmail.trim().toLowerCase() === approverEmail.toLowerCase(),
  );

  if (stepIndex === -1) {
    throw new Error("You are not assigned to a current approval step.");
  }

  const currentStep = contract.workflowSteps[stepIndex];

  if (!currentStep.assigneeEmail.trim()) {
    throw new Error(
      "This contract has not been picked up yet. Assign a legal owner before approving.",
    );
  }

  let workflowSteps = contract.workflowSteps.map((step, index) => {
    if (index !== stepIndex) {
      return step;
    }

    return {
      ...step,
      status: "completed" as const,
      completedAt: nowIsoDate(),
      note,
    };
  });

  const auditTrail = [
    ...contract.auditTrail,
    createAuditEvent(
      approverName,
      approverEmail,
      "Approved",
      `${currentStep.name} completed${note ? `: ${note}` : "."}`,
    ),
  ];

  if (!policy.requireAllApprovers) {
    workflowSteps = workflowSteps.map((step) => {
      if (step.id === "legal" && step.status !== "completed") {
        return step;
      }

      if (step.status === "current" || step.status === "upcoming") {
        return { ...step, status: "skipped" as const };
      }

      return step;
    });

    const legalStep = findLegalStep(workflowSteps);

    if (legalStep && legalStep.status !== "completed") {
      return {
        ...contract,
        workflowSteps,
        stage: stageForStep(legalStep, contract.companyProfileId),
        auditTrail,
        updatedAt: nowIsoTimestamp(),
      };
    }

    if (hasBlockingUnassignedLegal({ ...contract, workflowSteps })) {
      throw new Error(
        "Legal review must be assigned and completed before final approval.",
      );
    }

    return finalizeApprovedContract(contract, workflowSteps, policy, auditTrail);
  }

  const remainingCurrent = workflowSteps.filter(
    (step) => step.status === "current",
  );

  if (remainingCurrent.length > 0) {
    return {
      ...contract,
      workflowSteps,
      stage: stageForStep(remainingCurrent[0], contract.companyProfileId),
      auditTrail,
      updatedAt: nowIsoTimestamp(),
    };
  }

  if (hasBlockingUnassignedLegal(contract)) {
    throw new Error(
      "Legal review must be assigned and completed before final approval.",
    );
  }

  return finalizeApprovedContract(contract, workflowSteps, policy, auditTrail);
}

function isAmountPopulated(amount: string | undefined | null): boolean {
  return isPopulated(amount);
}

export { isAmountPopulated };

export function createContractFromIntake(
  input: ContractIntakeInput,
  identity: { id: string; recordNumber: string },
): ContractRecord {
  const contractAmount = safeTrim(input.contractAmount);
  const amountNumeric = parseContractAmount(contractAmount);
  const workflowSteps = resolveWorkflowSteps(
    amountNumeric,
    input.department,
    input.contractType,
    input.companyProfileId,
  );
  const timestamp = nowIsoTimestamp();
  const attachments = (input.attachments ?? []).map((attachment, index) => ({
    id: `att-${Date.now()}-${index}`,
    title: attachment.fileName,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    documentType: attachment.documentType,
    uploadedAt: timestamp,
    uploadedByName: input.requesterName,
    uploadedByEmail: input.requesterEmail,
    dataBase64: attachment.dataBase64,
    ...createIntakeAttachmentVersionFields(index),
  }));

  const auditTrail = [
    createAuditEvent(
      input.requesterName,
      input.requesterEmail,
      "Request submitted",
      `Contract intake completed and routed into the approval workflow. Record ID: ${identity.recordNumber}.`,
    ),
  ];

  for (const attachment of attachments) {
    auditTrail.push(
      createAuditEvent(
        input.requesterName,
        input.requesterEmail,
        "Document uploaded",
        `${getIntakeDocumentTypeLabel(attachment.documentType)}: ${attachment.title}`,
      ),
    );
  }

  return {
    id: identity.id,
    recordNumber: identity.recordNumber,
    requesterName: input.requesterName,
    requesterEmail: input.requesterEmail,
    department: input.department,
    contractType: input.contractType,
    contractStartDate: input.contractStartDate,
    contractEndDate: input.contractEndDate,
    title: input.contractTitle,
    description: input.contractDescription,
    amount: contractAmount,
    amountNumeric,
    budgeted:
      isAmountPopulated(contractAmount) && input.budgeted !== undefined
        ? input.budgeted
        : null,
    poNumber: isAmountPopulated(contractAmount)
      ? safeTrim(input.poNumber)
      : "",
    supplierId: "",
    supplierName: "",
    parentAgreementId: input.parentAgreementId ?? null,
    parentAgreementRecordNumber: "",
    parentAgreementTitle: "",
    confidential: false,
    otherNotes: safeTrim(input.otherNotes),
    companyName: safeTrim(input.companyName),
    address: safeTrim(input.address),
    mainContactName: safeTrim(input.mainContactName),
    mainContactTitle: safeTrim(input.mainContactTitle),
    mainContactEmail: safeTrim(input.mainContactEmail),
    mainContactPhone: safeTrim(input.mainContactPhone),
    counterpartyId: input.counterpartyId ?? null,
    companyProfileId: input.companyProfileId,
    templateId: input.templateId ?? null,
    templateVersion: input.templateVersion ?? null,
    intakeFormId: input.intakeFormId ?? null,
    stage: stageForStep(workflowSteps[0], input.companyProfileId),
    workflowSteps,
    currentStepIndex: 0,
    attachments,
    relatedEmails: [],
    contractVariables:
      (() => {
        const merged = {
          ...(input.customFields ?? {}),
          ...(input.templateVariables ?? {}),
        };
        return Object.keys(merged).length > 0 ? merged : null;
      })(),
    generatedDraftPath: null,
    missingVariables: null,
    auditTrail,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function approveContractStep(
  contract: ContractRecord,
  approverEmail: string,
  approverName: string,
  note?: string,
): ContractRecord {
  const policy = resolveContractPolicy(contract);

  if (policy.allowParallelApprovals) {
    return completeParallelApproval(
      contract,
      approverEmail,
      approverName,
      note,
      policy,
    );
  }

  return completeSequentialApproval(
    contract,
    approverEmail,
    approverName,
    note,
    policy,
  );
}

export function reassignCurrentApprovalStep(
  contract: ContractRecord,
  newAssignee: { email: string; name: string },
  actor: { email: string; name: string },
  note?: string,
  targetAssigneeEmail?: string,
): ContractRecord {
  const policy = resolveContractPolicy(contract);
  const normalizedTarget = targetAssigneeEmail?.trim().toLowerCase();
  const stepIndex = policy.allowParallelApprovals
    ? contract.workflowSteps.findIndex(
        (step) =>
          step.status === "current" &&
          (!normalizedTarget ||
            step.assigneeEmail.trim().toLowerCase() === normalizedTarget),
      )
    : contract.currentStepIndex;
  const currentStep =
    stepIndex >= 0 ? contract.workflowSteps[stepIndex] : undefined;

  if (!currentStep) {
    throw new Error("No pending approval step.");
  }

  if (!isAwaitingApproval(contract)) {
    throw new Error("This contract is not awaiting approval.");
  }

  if (currentStep.status !== "current") {
    throw new Error("No pending approval step.");
  }

  const normalizedEmail = safeTrim(newAssignee.email).toLowerCase();
  const normalizedName = safeTrim(newAssignee.name);

  if (!normalizedEmail) {
    throw new Error("Select a person to assign this approval to.");
  }

  if (!normalizedName) {
    throw new Error("Assignee name is required.");
  }

  if (currentStep.assigneeEmail.toLowerCase() === normalizedEmail) {
    throw new Error("This approval is already assigned to that person.");
  }

  const workflowSteps = contract.workflowSteps.map((step, index) => {
    if (index !== stepIndex) {
      return step;
    }

    return {
      ...stampCurrentStep({
        ...step,
        assigneeEmail: normalizedEmail,
        assigneeName: normalizedName,
      }),
      assignedAt: nowIsoTimestamp(),
    };
  });

  const detail = note?.trim()
    ? `${currentStep.name} reassigned from ${currentStep.assigneeName} to ${normalizedName}: ${note.trim()}`
    : `${currentStep.name} reassigned from ${currentStep.assigneeName} (${currentStep.assigneeEmail}) to ${normalizedName} (${normalizedEmail}).`;

  return {
    ...contract,
    workflowSteps,
    auditTrail: [
      ...contract.auditTrail,
      createAuditEvent(
        actor.name,
        actor.email,
        "Approval reassigned",
        detail,
      ),
    ],
    updatedAt: nowIsoTimestamp(),
  };
}

export function assignLegalReviewerStep(
  contract: ContractRecord,
  assignee: { email: string; name: string },
  actor: { email: string; name: string },
): ContractRecord {
  const legalStep = contract.workflowSteps.find((step) => step.id === "legal");

  if (!legalStep) {
    throw new Error("This contract does not have a legal review step.");
  }

  const normalizedEmail = safeTrim(assignee.email).toLowerCase();
  const normalizedName = safeTrim(assignee.name);

  if (!normalizedEmail) {
    throw new Error("Select a legal reviewer.");
  }

  if (!normalizedName) {
    throw new Error("Assignee name is required.");
  }

  const previousLabel = legalStep.assigneeEmail.trim()
    ? `${legalStep.assigneeName} (${legalStep.assigneeEmail})`
    : "Unassigned";

  return {
    ...contract,
    workflowSteps: contract.workflowSteps.map((step) =>
      step.id === "legal"
        ? {
            ...stampCurrentStep({
              ...step,
              assigneeEmail: normalizedEmail,
              assigneeName: normalizedName,
            }),
            assignedAt: nowIsoTimestamp(),
          }
        : step,
    ),
    auditTrail: [
      ...contract.auditTrail,
      createAuditEvent(
        actor.name,
        actor.email,
        legalStep.assigneeEmail.trim()
          ? "Legal assignment updated"
          : "Legal review picked up",
        legalStep.assigneeEmail.trim()
          ? `Reassigned legal review from ${previousLabel} to ${normalizedName} (${normalizedEmail}).`
          : `${normalizedName} (${normalizedEmail}) picked up this contract for legal review.`,
      ),
    ],
    updatedAt: nowIsoTimestamp(),
  };
}

export function rejectContractStep(
  contract: ContractRecord,
  approverEmail: string,
  approverName: string,
  note?: string,
): ContractRecord {
  const policy = resolveContractPolicy(contract);
  const stepIndex = policy.allowParallelApprovals
    ? contract.workflowSteps.findIndex(
        (step) =>
          step.status === "current" &&
          step.assigneeEmail.trim().toLowerCase() ===
            approverEmail.toLowerCase(),
      )
    : contract.currentStepIndex;
  const currentStep =
    stepIndex >= 0 ? contract.workflowSteps[stepIndex] : undefined;

  if (!currentStep) {
    throw new Error("No pending approval step.");
  }

  if (!currentStep.assigneeEmail.trim()) {
    throw new Error(
      "This contract has not been picked up yet. Assign a legal owner before rejecting.",
    );
  }

  if (
    currentStep.assigneeEmail.toLowerCase() !== approverEmail.toLowerCase()
  ) {
    throw new Error("You are not assigned to the current approval step.");
  }

  const workflowSteps = contract.workflowSteps.map((step, index) => {
    if (index === stepIndex) {
      return {
        ...step,
        status: "rejected" as const,
        completedAt: nowIsoDate(),
        note,
      };
    }

    if (
      policy.allowParallelApprovals
        ? step.status === "current" || step.status === "upcoming"
        : index > contract.currentStepIndex && step.status === "upcoming"
    ) {
      return { ...step, status: "skipped" as const };
    }

    return step;
  });

  return {
    ...contract,
    workflowSteps,
    stage: "rejected",
    auditTrail: [
      ...contract.auditTrail,
      createAuditEvent(
        approverName,
        approverEmail,
        "Rejected",
        `${currentStep.name} rejected${note ? `: ${note}` : "."}`,
      ),
    ],
    updatedAt: nowIsoTimestamp(),
  };
}

export function activateContract(
  contract: ContractRecord,
  actorName: string,
  actorEmail: string,
): ContractRecord {
  if (contract.stage !== "awaiting_signature") {
    throw new Error("Contract is not awaiting signature.");
  }

  return {
    ...contract,
    stage: "active",
    auditTrail: [
      ...contract.auditTrail,
      createAuditEvent(
        actorName,
        actorEmail,
        "Executed",
        "Contract marked as signed and active.",
      ),
    ],
    updatedAt: nowIsoTimestamp(),
  };
}

export function getLifecycleSummary(contract: ContractRecord): string {
  if (contract.stage === "active") {
    return "Contract is active and being managed.";
  }

  if (contract.stage === "rejected") {
    return "Contract was rejected during approval.";
  }

  if (contract.stage === "awaiting_signature") {
    return "All approvals complete. Awaiting signature.";
  }

  const current = getCurrentApprover(contract);
  return current
    ? `Waiting on ${current.name} (${current.assigneeName}).`
    : "In workflow.";
}
