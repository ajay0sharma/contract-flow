import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  dispatchContractEmailPayload,
  type ContractEmailDispatchPayload,
} from "@/lib/contract-email-service";
import { getCurrentApprover, getActiveApprovalSteps } from "@/lib/workflow-engine";
import { getWorkflowPolicy } from "@/lib/workflow-policy-read";
import { resolveOrganizationPolicyId } from "@/lib/workflow-policy-normalize";
import type { ContractRecord } from "@/types/contract";

function buildContractUrl(contractId: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000";

  return `${baseUrl.replace(/\/$/, "")}/contracts/${contractId}`;
}

async function dispatchContractEmail(payload: {
  contract: ContractRecord;
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const message: ContractEmailDispatchPayload = {
    event: "contract_notification",
    organizationId: resolveClauseLibraryOrganizationId(
      payload.contract.companyProfileId,
    ),
    contractId: payload.contract.id,
    recordNumber: payload.contract.recordNumber,
    contractUrl: buildContractUrl(payload.contract.id),
    from: "notifications@contractflow.app",
    to: payload.to,
    subject: payload.subject,
    body: payload.body,
  };

  await dispatchContractEmailPayload(message);
}

function resolvePolicy(contract: ContractRecord) {
  return getWorkflowPolicy(resolveOrganizationPolicyId(contract.companyProfileId));
}

export async function sendContractIntakeNotification(
  contract: ContractRecord,
): Promise<void> {
  if (!resolvePolicy(contract).notifyAssigneesByEmail) {
    return;
  }

  const contractUrl = buildContractUrl(contract.id);
  const recipients = getActiveApprovalSteps(contract).filter(
    (step) => step.assigneeEmail.trim(),
  );

  for (const step of recipients) {
    await dispatchContractEmail({
      contract,
      to: step.assigneeEmail,
      subject: `Contract approval needed: ${contract.title}`,
      body: [
        `Hello ${step.assigneeName},`,
        "",
        `Contract ${contract.recordNumber} (${contract.title}) has been submitted and is ready for ${step.name}.`,
        contractUrl,
      ].join("\n"),
    });
  }
}

export async function sendContractApprovalNotification(
  contract: ContractRecord,
): Promise<void> {
  if (!resolvePolicy(contract).notifyAssigneesByEmail) {
    return;
  }

  const policy = resolvePolicy(contract);
  const contractUrl = buildContractUrl(contract.id);

  if (policy.allowParallelApprovals) {
    const activeSteps = getActiveApprovalSteps(contract).filter((step) =>
      step.assigneeEmail.trim(),
    );

    for (const step of activeSteps) {
      await dispatchContractEmail({
        contract,
        to: step.assigneeEmail,
        subject: `Contract approval needed: ${contract.title}`,
        body: [
          `Hello ${step.assigneeName},`,
          "",
          `Contract ${contract.recordNumber} (${contract.title}) is ready for ${step.name}.`,
          contractUrl,
        ].join("\n"),
      });
    }

    if (activeSteps.length > 0) {
      return;
    }
  }

  const nextApprover = getCurrentApprover(contract);

  if (nextApprover?.assigneeEmail.trim()) {
    await dispatchContractEmail({
      contract,
      to: nextApprover.assigneeEmail,
      subject: `Contract approval needed: ${contract.title}`,
      body: [
        `Hello ${nextApprover.assigneeName},`,
        "",
        `Contract ${contract.recordNumber} (${contract.title}) is ready for your review.`,
        contractUrl,
      ].join("\n"),
    });
    return;
  }

  if (["awaiting_signature", "active"].includes(contract.stage)) {
    await dispatchContractEmail({
      contract,
      to: contract.requesterEmail,
      subject: `Contract approved: ${contract.title}`,
      body: [
        `Hello ${contract.requesterName},`,
        "",
        `Your contract request ${contract.recordNumber} (${contract.title}) has completed all required approvals.`,
        contractUrl,
      ].join("\n"),
    });
  }
}

export async function sendContractRejectionNotification(
  contract: ContractRecord,
  note?: string,
): Promise<void> {
  if (!resolvePolicy(contract).notifyAssigneesByEmail) {
    return;
  }

  const contractUrl = buildContractUrl(contract.id);

  await dispatchContractEmail({
    contract,
    to: contract.requesterEmail,
    subject: `Contract rejected: ${contract.title}`,
    body: [
      `Hello ${contract.requesterName},`,
      "",
      `Your contract request ${contract.recordNumber} (${contract.title}) was rejected during approval.`,
      note ? `Reason: ${note}` : "",
      contractUrl,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

export async function sendContractReassignmentNotification(
  contract: ContractRecord,
  previousAssigneeEmail: string,
): Promise<void> {
  if (!resolvePolicy(contract).notifyAssigneesByEmail) {
    return;
  }

  const currentApprover = getCurrentApprover(contract);
  const contractUrl = buildContractUrl(contract.id);

  if (!currentApprover) {
    return;
  }

  if (
    currentApprover.assigneeEmail.toLowerCase() !==
    previousAssigneeEmail.toLowerCase()
  ) {
    await dispatchContractEmail({
      contract,
      to: currentApprover.assigneeEmail,
      subject: `Contract approval assigned to you: ${contract.title}`,
      body: [
        `Hello ${currentApprover.assigneeName},`,
        "",
        `Contract ${contract.recordNumber} (${contract.title}) has been routed to you for ${currentApprover.name}.`,
        contractUrl,
      ].join("\n"),
    });
  }
}

export async function sendRenewalReminderNotification(input: {
  contract: ContractRecord;
  to: string;
  recipientName: string;
  reminderLabel: string;
  expirationDate: string;
  actionDeadline: string | null;
  daysUntilExpiration: number;
  autoRenewal: boolean;
}): Promise<void> {
  const contractUrl = buildContractUrl(input.contract.id);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000";
  const renewalUrl = `${baseUrl.replace(/\/$/, "")}/renewals`;
  const autoRenewalLine = input.autoRenewal
    ? "This agreement is configured to auto-renew unless notice is given."
    : "This agreement requires an explicit renewal decision.";

  await dispatchContractEmail({
    contract: input.contract,
    to: input.to,
    subject: `Renewal reminder: ${input.contract.title} (${input.contract.recordNumber})`,
    body: [
      `Hello ${input.recipientName},`,
      "",
      `${input.reminderLabel} for ${input.contract.recordNumber} (${input.contract.title}).`,
      `Expiration date: ${input.expirationDate}.`,
      input.actionDeadline
        ? `Renewal notice deadline: ${input.actionDeadline}.`
        : "",
      input.daysUntilExpiration >= 0
        ? `${input.daysUntilExpiration} day(s) remaining until expiration.`
        : "This contract is past its expiration date.",
      autoRenewalLine,
      "",
      `Review renewal queue: ${renewalUrl}`,
      `Open contract: ${contractUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

export async function sendApprovalReminderNotification(input: {
  contract: ContractRecord;
  to: string;
  recipientName: string;
  stepName: string;
  daysWaiting: number;
}): Promise<void> {
  if (!resolvePolicy(input.contract).notifyAssigneesByEmail) {
    return;
  }

  const contractUrl = buildContractUrl(input.contract.id);

  await dispatchContractEmail({
    contract: input.contract,
    to: input.to,
    subject: `Approval reminder: ${input.contract.title}`,
    body: [
      `Hello ${input.recipientName},`,
      "",
      `Contract ${input.contract.recordNumber} (${input.contract.title}) has been waiting ${input.daysWaiting} day(s) for ${input.stepName}.`,
      contractUrl,
    ].join("\n"),
  });
}

export async function sendApprovalEscalationNotification(input: {
  contract: ContractRecord;
  to: string;
  recipientName: string;
  stepName: string;
  assigneeName: string;
  daysWaiting: number;
}): Promise<void> {
  if (!resolvePolicy(input.contract).notifyAssigneesByEmail) {
    return;
  }

  const contractUrl = buildContractUrl(input.contract.id);

  await dispatchContractEmail({
    contract: input.contract,
    to: input.to,
    subject: `Approval escalation: ${input.contract.title}`,
    body: [
      `Hello ${input.recipientName},`,
      "",
      `Contract ${input.contract.recordNumber} (${input.contract.title}) has exceeded the approval SLA.`,
      `${input.stepName} has been waiting ${input.daysWaiting} day(s) with ${input.assigneeName}.`,
      contractUrl,
    ].join("\n"),
  });
}
