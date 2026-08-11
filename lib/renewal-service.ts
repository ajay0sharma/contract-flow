import { getLegalTeamEmails } from "@/lib/access-control";
import {
  getAllowedOrganizationIds,
  resolveClauseLibraryOrganizationId,
} from "@/lib/clause-library-org";
import {
  createAndPersistContract,
  markContractExpired,
  saveContractRecord,
} from "@/lib/contract-persistence";
import { loadMergedContractRecord, listMergedContractRecords } from "@/lib/contract-list-service";
import { sendRenewalReminderNotification } from "@/lib/contract-notifications";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import {
  applyRenewalSettingsToRecord,
  buildRenewalIntakeInput,
  listRenewalReminderCandidates,
  resolveRenewalSettings,
  shouldAutoExpireContract,
} from "@/lib/renewal-workflow";
import type { ContractRecord, RenewalReminderType } from "@/types/contract";

function createAuditEvent(
  actorName: string,
  actorEmail: string,
  action: string,
  detail: string,
) {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    actorName,
    actorEmail,
    action,
    detail,
  };
}

function reminderLabelForType(reminderType: RenewalReminderType): string {
  switch (reminderType) {
    case "notice_90":
      return "90-day renewal reminder";
    case "notice_60":
      return "60-day renewal reminder";
    case "notice_30":
      return "30-day renewal reminder";
    case "notice_14":
      return "14-day renewal reminder";
    case "notice_7":
      return "7-day renewal reminder";
    case "expiration_day":
      return "Contract expiration reminder";
    case "action_deadline":
      return "Renewal notice deadline reminder";
    default:
      return "Renewal reminder";
  }
}

export async function startRenewalAndPersist(
  contractId: string,
  organizationId: string,
  actor: { email: string; name: string },
): Promise<{ source: ContractRecord; renewal: ContractRecord }> {
  const source = await loadMergedContractRecord(contractId, organizationId);

  if (!source) {
    throw new Error("Contract not found.");
  }

  if (source.stage !== "active") {
    throw new Error("Only active contracts can be renewed.");
  }

  if (source.renewalStatus === "renewal_in_progress") {
    throw new Error("A renewal is already in progress for this contract.");
  }

  if (source.renewalStatus === "renewed") {
    throw new Error("This contract has already been renewed.");
  }

  const renewalInput = buildRenewalIntakeInput(source, actor);
  const renewal = await createAndPersistContract(renewalInput, organizationId);
  const settings = resolveRenewalSettings(source);
  const updatedRenewal: ContractRecord = {
    ...renewal,
    renewedFromContractId: source.id,
    parentAgreementRecordNumber: source.recordNumber,
    parentAgreementTitle: source.title,
    autoRenewal: settings.autoRenewal,
    renewalNoticeDays: settings.renewalNoticeDays,
  };

  await saveContractRecord(updatedRenewal);

  const updatedSource: ContractRecord = {
    ...source,
    renewalStatus: "renewal_in_progress",
    renewalStartedAt: new Date().toISOString(),
    auditTrail: [
      ...source.auditTrail,
      createAuditEvent(
        actor.name,
        actor.email,
        "Renewal started",
        `Renewal request ${updatedRenewal.recordNumber} created from this contract.`,
      ),
    ],
    updatedAt: new Date().toISOString(),
  };

  await saveContractRecord(updatedSource);

  return {
    source: updatedSource,
    renewal: updatedRenewal,
  };
}

export async function updateRenewalDecisionAndPersist(
  contractId: string,
  organizationId: string,
  decision: "non_renewing" | "renewed",
  actor: { email: string; name: string },
  note?: string,
): Promise<ContractRecord> {
  const contract = await loadMergedContractRecord(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  if (contract.stage !== "active") {
    throw new Error("Renewal decisions apply to active contracts only.");
  }

  const updated: ContractRecord = {
    ...contract,
    renewalStatus: decision,
    auditTrail: [
      ...contract.auditTrail,
      createAuditEvent(
        actor.name,
        actor.email,
        decision === "non_renewing" ? "Marked non-renewing" : "Marked renewed",
        note?.trim()
          ? note.trim()
          : decision === "non_renewing"
            ? "Contract marked as not renewing at expiration."
            : "Contract marked as renewed.",
      ),
    ],
    updatedAt: new Date().toISOString(),
  };

  await saveContractRecord(updated);
  return updated;
}

export async function processRenewalRemindersForOrganization(
  organizationId: string,
): Promise<{
  candidates: number;
  sent: number;
  skipped: number;
  autoExpired: number;
}> {
  if (!isDatabaseConfigured()) {
    return { candidates: 0, sent: 0, skipped: 0, autoExpired: 0 };
  }

  const prisma = getPrismaClient();
  const contracts = await listMergedContractRecords(organizationId);
  const normalizedContracts = contracts.map(applyRenewalSettingsToRecord);
  const candidates = listRenewalReminderCandidates(normalizedContracts);
  const legalRecipients = getLegalTeamEmails();
  let sent = 0;
  let skipped = 0;
  let autoExpired = 0;

  for (const contract of normalizedContracts) {
    if (shouldAutoExpireContract(contract)) {
      await markContractExpired(
        contract.id,
        organizationId,
        "Renewal Reminder Cron",
        "system@contractflow.app",
      );
      autoExpired += 1;
    }
  }

  for (const candidate of candidates) {
    const settings = resolveRenewalSettings(candidate.contract);
    const expirationDate =
      candidate.contract.expiryDate?.slice(0, 10) ??
      candidate.contract.contractEndDate;
    const recipients = new Map<string, string>();

    recipients.set(
      candidate.contract.requesterEmail.toLowerCase(),
      candidate.contract.requesterName,
    );

    for (const email of legalRecipients) {
      recipients.set(email.toLowerCase(), email);
    }

    for (const [email, name] of recipients.entries()) {
      const existing = await prisma.contractRenewalReminder.findUnique({
        where: {
          contractId_reminderType_recipientEmail: {
            contractId: candidate.contract.id,
            reminderType: candidate.reminderType,
            recipientEmail: email,
          },
        },
      });

      if (existing) {
        skipped += 1;
        continue;
      }

      await sendRenewalReminderNotification({
        contract: candidate.contract,
        to: email,
        recipientName: name,
        reminderLabel: reminderLabelForType(candidate.reminderType),
        expirationDate: expirationDate ?? candidate.actionDeadline ?? "",
        actionDeadline: candidate.actionDeadline,
        daysUntilExpiration: candidate.daysUntilExpiration,
        autoRenewal: settings.autoRenewal,
      });

      await prisma.contractRenewalReminder.create({
        data: {
          organizationId,
          contractId: candidate.contract.id,
          reminderType: candidate.reminderType,
          recipientEmail: email,
        },
      });

      sent += 1;
    }
  }

  return {
    candidates: candidates.length,
    sent,
    skipped,
    autoExpired,
  };
}

export async function processRenewalRemindersForAllOrganizations(): Promise<
  Array<{
    organizationId: string;
    candidates: number;
    sent: number;
    skipped: number;
    autoExpired: number;
  }>
> {
  const organizationIds = getAllowedOrganizationIds();
  const results = [];

  for (const organizationId of organizationIds) {
    const resolvedOrganizationId =
      resolveClauseLibraryOrganizationId(organizationId);
    results.push({
      organizationId: resolvedOrganizationId,
      ...(await processRenewalRemindersForOrganization(resolvedOrganizationId)),
    });
  }

  return results;
}
