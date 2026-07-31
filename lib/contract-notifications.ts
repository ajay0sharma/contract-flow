import {
  dispatchContractEmailPayload,
  type ContractEmailDispatchPayload,
} from "@/lib/contract-email-service";
import { getCurrentApprover } from "@/lib/workflow-engine";
import { getWorkflowPolicy } from "@/lib/policy-store";
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
    organizationId: payload.contract.companyProfileId,
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

export async function sendContractApprovalNotification(
  contract: ContractRecord,
): Promise<void> {
  if (!getWorkflowPolicy().notifyAssigneesByEmail) {
    return;
  }

  const nextApprover = getCurrentApprover(contract);
  const contractUrl = buildContractUrl(contract.id);

  if (nextApprover) {
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
): Promise<void> {
  if (!getWorkflowPolicy().notifyAssigneesByEmail) {
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
      contractUrl,
    ].join("\n"),
  });
}

export async function sendContractReassignmentNotification(
  contract: ContractRecord,
  previousAssigneeEmail: string,
): Promise<void> {
  if (!getWorkflowPolicy().notifyAssigneesByEmail) {
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
