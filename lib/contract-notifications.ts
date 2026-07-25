import { getCurrentApprover } from "@/lib/workflow-engine";
import { getWorkflowPolicy } from "@/lib/policy-store";
import type { ContractRecord } from "@/types/contract";

export interface ContractEmailPayload {
  to: string;
  subject: string;
  body: string;
}

function buildContractUrl(contractId: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000";

  return `${baseUrl.replace(/\/$/, "")}/contracts/${contractId}`;
}

async function dispatchContractEmail(payload: ContractEmailPayload): Promise<void> {
  console.info("[contract-email]", payload);

  // Hook for a future provider (Resend, SendGrid, etc.).
  if (process.env.CONTRACT_EMAIL_WEBHOOK_URL?.trim()) {
    await fetch(process.env.CONTRACT_EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
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
