import { getLegalTeamEmails } from "@/lib/access-control";
import {
  getAllowedOrganizationIds,
  resolveClauseLibraryOrganizationId,
} from "@/lib/clause-library-org";
import { listMergedContractRecords } from "@/lib/contract-list-service";
import {
  sendApprovalEscalationNotification,
  sendApprovalReminderNotification,
} from "@/lib/contract-notifications";
import { saveContractRecord } from "@/lib/contract-persistence";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import { getWorkflowPolicy } from "@/lib/workflow-policy-read";
import {
  getActiveApprovalSteps,
  isAwaitingApproval,
  reassignCurrentApprovalStep,
} from "@/lib/workflow-engine";
import type {
  ApprovalReminderType,
  ContractRecord,
} from "@/types/contract";

export function reminderTypeForDay(day: number): ApprovalReminderType {
  if (day === 1) return "reminder_1";
  if (day === 3) return "reminder_3";
  if (day === 7) return "reminder_7";
  return "reminder_14";
}

function computeDaysWaiting(assignedAt: string | undefined): number | null {
  if (!assignedAt?.trim()) {
    return null;
  }

  const assigned = new Date(assignedAt);

  if (Number.isNaN(assigned.getTime())) {
    return null;
  }

  const diffMs = Date.now() - assigned.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export function listApprovalEscalationCandidates(
  contracts: ContractRecord[],
  organizationId: string,
): Array<{
  contract: ContractRecord;
  stepId: string;
  stepName: string;
  assigneeEmail: string;
  assigneeName: string;
  daysWaiting: number;
  reminderType: ApprovalReminderType;
}> {
  const policy = getWorkflowPolicy(organizationId);
  const candidates: Array<{
    contract: ContractRecord;
    stepId: string;
    stepName: string;
    assigneeEmail: string;
    assigneeName: string;
    daysWaiting: number;
    reminderType: ApprovalReminderType;
  }> = [];

  for (const contract of contracts) {
    if (!isAwaitingApproval(contract)) {
      continue;
    }

    for (const step of getActiveApprovalSteps(contract)) {
      if (!step.assigneeEmail.trim()) {
        continue;
      }

      const daysWaiting = computeDaysWaiting(step.assignedAt);

      if (daysWaiting === null) {
        continue;
      }

      for (const threshold of policy.approvalReminderDays) {
        if (daysWaiting >= threshold) {
          candidates.push({
            contract,
            stepId: step.id,
            stepName: step.name,
            assigneeEmail: step.assigneeEmail,
            assigneeName: step.assigneeName,
            daysWaiting,
            reminderType: reminderTypeForDay(threshold),
          });
        }
      }

      if (
        policy.escalateAfterDays > 0 &&
        daysWaiting >= policy.escalateAfterDays
      ) {
        candidates.push({
          contract,
          stepId: step.id,
          stepName: step.name,
          assigneeEmail: step.assigneeEmail,
          assigneeName: step.assigneeName,
          daysWaiting,
          reminderType: "escalation",
        });
      }
    }
  }

  return candidates;
}

export async function processApprovalEscalationsForOrganization(
  organizationId: string,
): Promise<{
  candidates: number;
  sent: number;
  skipped: number;
  escalated: number;
}> {
  if (!isDatabaseConfigured()) {
    return { candidates: 0, sent: 0, skipped: 0, escalated: 0 };
  }

  const prisma = getPrismaClient();
  const policy = getWorkflowPolicy(organizationId);
  const contracts = await listMergedContractRecords(organizationId);
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const candidates = listApprovalEscalationCandidates(contracts, organizationId);
  let sent = 0;
  let skipped = 0;
  let escalated = 0;

  for (const candidate of candidates) {
    const contract =
      contractById.get(candidate.contract.id) ?? candidate.contract;
    const recipients: Array<{ email: string; name: string }> = [
      {
        email: candidate.assigneeEmail,
        name: candidate.assigneeName,
      },
    ];

    if (
      candidate.reminderType === "escalation" &&
      policy.notifyEscalationContact &&
      policy.escalationContactEmail.trim()
    ) {
      recipients.push({
        email: policy.escalationContactEmail.trim(),
        name: policy.escalationContactEmail.trim(),
      });
    }

    if (candidate.reminderType === "escalation") {
      for (const legalEmail of getLegalTeamEmails()) {
        recipients.push({ email: legalEmail, name: legalEmail });
      }
    }

    const uniqueRecipients = new Map<string, string>();
    for (const recipient of recipients) {
      uniqueRecipients.set(recipient.email.toLowerCase(), recipient.name);
    }

    const normalizedAssigneeEmail = candidate.assigneeEmail.trim().toLowerCase();
    const normalizedEscalationContact = policy.escalationContactEmail
      .trim()
      .toLowerCase();
    let assigneeEscalationNewlySent = false;

    for (const [email, name] of uniqueRecipients.entries()) {
      const existing = await prisma.contractApprovalReminder.findUnique({
        where: {
          contractId_reminderType_recipientEmail: {
            contractId: contract.id,
            reminderType: candidate.reminderType,
            recipientEmail: email,
          },
        },
      });

      if (existing) {
        skipped += 1;
        continue;
      }

      if (candidate.reminderType === "escalation") {
        await sendApprovalEscalationNotification({
          contract,
          to: email,
          recipientName: name,
          stepName: candidate.stepName,
          assigneeName: candidate.assigneeName,
          daysWaiting: candidate.daysWaiting,
        });

        if (email === normalizedAssigneeEmail) {
          assigneeEscalationNewlySent = true;
        }
      } else {
        await sendApprovalReminderNotification({
          contract,
          to: email,
          recipientName: name,
          stepName: candidate.stepName,
          daysWaiting: candidate.daysWaiting,
        });
      }

      await prisma.contractApprovalReminder.create({
        data: {
          organizationId,
          contractId: contract.id,
          reminderType: candidate.reminderType,
          recipientEmail: email,
        },
      });

      sent += 1;
    }

    if (
      candidate.reminderType === "escalation" &&
      assigneeEscalationNewlySent &&
      policy.escalationContactEmail.trim() &&
      normalizedAssigneeEmail !== normalizedEscalationContact
    ) {
      const updated = reassignCurrentApprovalStep(
        contract,
        {
          email: policy.escalationContactEmail.trim(),
          name: policy.escalationContactEmail.trim(),
        },
        {
          email: "system@approval-escalation",
          name: "Approval Escalation Cron",
        },
        `Automatically escalated after ${candidate.daysWaiting} day(s) waiting on ${candidate.stepName}.`,
        candidate.assigneeEmail,
      );

      await saveContractRecord(updated);
      contractById.set(updated.id, updated);
      escalated += 1;
    }
  }

  return {
    candidates: candidates.length,
    sent,
    skipped,
    escalated,
  };
}

export async function processApprovalEscalationsForAllOrganizations(): Promise<
  Array<{
    organizationId: string;
    candidates: number;
    sent: number;
    skipped: number;
    escalated: number;
  }>
> {
  const results = [];

  for (const organizationId of getAllowedOrganizationIds()) {
    const resolvedOrganizationId =
      resolveClauseLibraryOrganizationId(organizationId);
    results.push({
      organizationId: resolvedOrganizationId,
      ...(await processApprovalEscalationsForOrganization(resolvedOrganizationId)),
    });
  }

  return results;
}
