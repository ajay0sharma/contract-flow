import { randomInt, randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { recordContractAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { resolveOrganizationIdByRecordNumber } from "@/lib/contract-email-org";
import {
  findMatchingRelatedEmail,
  hasMatchingRelatedEmail,
  storeProviderMessageId,
} from "@/lib/contract-email-dedup";
import { sendContractRecordEmail } from "@/lib/contract-email-service";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { appendRelatedEmailToRecord, addContractEmail } from "@/lib/contract-store";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import {
  approveContractStep,
  createContractFromIntake,
  reassignCurrentApprovalStep,
  rejectContractStep,
  assignLegalReviewerStep,
} from "@/lib/workflow-engine";
import type {
  AuditEvent,
  AddContractEmailInput,
  ContractAttachment,
  ContractEmail,
  ContractIntakeInput,
  ContractLifecycleStatus,
  ContractRecord,
  ContractStage,
  ContractEmailDirection,
  SendContractEmailInput,
  WorkflowStep,
} from "@/types/contract";

type ContractRow = Prisma.ContractGetPayload<Record<string, never>>;

type ListContractRecordsFilters = {
  stage?: string;
  contractType?: string;
  requesterEmail?: string;
  search?: string;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseWorkflowSteps(value: unknown): WorkflowStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as WorkflowStep[];
}

function parseAuditTrail(value: unknown): AuditEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as AuditEvent[];
}

function parseAttachments(value: unknown): ContractAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as ContractAttachment[];
}

function parseRelatedEmails(value: unknown): ContractEmail[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as ContractEmail[];
}

function toAmountNumeric(value: Prisma.Decimal | null | undefined): number {
  if (value == null) {
    return 0;
  }

  return Number(value);
}

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function deriveContractStatus(
  stage: ContractStage,
): ContractLifecycleStatus {
  if (stage === "active") return "active";
  if (stage === "rejected") return "rejected";
  if (stage === "expired") return "expired";
  if (stage === "request") return "draft";
  return "pending";
}

function createAuditEvent(
  actorName: string,
  actorEmail: string,
  action: string,
  detail: string,
): AuditEvent {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    actorName,
    actorEmail,
    action,
    detail,
  };
}

function resolveLifecycleWriteFields(
  incomingStage: ContractStage,
  existing: ContractRow | null,
): {
  contractStatus: ContractLifecycleStatus;
  activatedAt?: Date;
  expiredAt?: Date;
} {
  const contractStatus = deriveContractStatus(incomingStage);
  const previousStage = existing?.stage as ContractStage | undefined;
  const fields: {
    contractStatus: ContractLifecycleStatus;
    activatedAt?: Date;
    expiredAt?: Date;
  } = { contractStatus };

  if (
    incomingStage === "active" &&
    previousStage !== "active" &&
    !existing?.activatedAt
  ) {
    fields.activatedAt = new Date();
  }

  if (
    incomingStage === "expired" &&
    previousStage !== "expired" &&
    !existing?.expiredAt
  ) {
    fields.expiredAt = new Date();
  }

  return fields;
}

function parseContractVariables(
  value: unknown,
): Record<string, string> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, entryValue]) =>
      typeof entryValue === "string" ||
      typeof entryValue === "number" ||
      typeof entryValue === "boolean",
  );

  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(
    entries.map(([key, entryValue]) => [key, String(entryValue)]),
  );
}

export function mapPrismaContractToRecord(record: ContractRow): ContractRecord {
  return {
    id: record.id,
    recordNumber: record.recordNumber,
    requesterName: record.requesterName,
    requesterEmail: record.requesterEmail,
    department: record.department ?? "",
    contractType: record.contractType,
    contractStartDate: record.contractStartDate ?? "",
    contractEndDate: record.contractEndDate ?? "",
    title: record.title,
    description: record.description ?? "",
    amount: record.amount ?? "",
    amountNumeric: toAmountNumeric(record.amountNumeric),
    budgeted: record.budgeted,
    poNumber: record.poNumber ?? "",
    supplierId: record.supplierId,
    supplierName: record.supplierName,
    parentAgreementId: record.parentAgreementId,
    parentAgreementRecordNumber: record.parentAgreementRecordNumber,
    parentAgreementTitle: record.parentAgreementTitle,
    confidential: record.confidential,
    otherNotes: record.otherNotes ?? "",
    companyName: record.companyName ?? "",
    address: record.address ?? "",
    mainContactName: record.mainContactName ?? "",
    mainContactTitle: record.mainContactTitle ?? "",
    mainContactEmail: record.mainContactEmail ?? "",
    mainContactPhone: record.mainContactPhone ?? "",
    counterpartyId: record.counterpartyId,
    companyProfileId: record.companyProfileId ?? record.organizationId,
    templateId: record.templateId,
    templateVersion: record.templateVersion,
    stage: record.stage as ContractStage,
    contractStatus: record.contractStatus as ContractLifecycleStatus,
    expiryDate: toIsoString(record.expiryDate),
    effectiveDate: toIsoString(record.effectiveDate),
    activatedAt: toIsoString(record.activatedAt),
    expiredAt: toIsoString(record.expiredAt),
    contractVariables: parseContractVariables(record.contractVariables),
    currentStepIndex: record.currentStepIndex,
    workflowSteps: parseWorkflowSteps(record.workflowSteps),
    auditTrail: parseAuditTrail(record.auditTrail),
    attachments: parseAttachments(record.attachments),
    relatedEmails: parseRelatedEmails(record.relatedEmails),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapRecordToPrismaData(
  record: ContractRecord,
  organizationId: string,
): Prisma.ContractUncheckedCreateInput {
  return {
    id: record.id,
    organizationId,
    recordNumber: record.recordNumber,
    requesterName: record.requesterName,
    requesterEmail: record.requesterEmail,
    department: record.department || null,
    contractType: record.contractType,
    contractStartDate: record.contractStartDate || null,
    contractEndDate: record.contractEndDate || null,
    title: record.title,
    description: record.description || null,
    amount: record.amount || null,
    amountNumeric: new Prisma.Decimal(record.amountNumeric),
    budgeted: record.budgeted,
    poNumber: record.poNumber || null,
    supplierId: record.supplierId,
    supplierName: record.supplierName,
    parentAgreementId: record.parentAgreementId,
    parentAgreementRecordNumber: record.parentAgreementRecordNumber,
    parentAgreementTitle: record.parentAgreementTitle,
    confidential: record.confidential,
    otherNotes: record.otherNotes || null,
    companyName: record.companyName || null,
    address: record.address || null,
    mainContactName: record.mainContactName || null,
    mainContactTitle: record.mainContactTitle || null,
    mainContactEmail: record.mainContactEmail || null,
    mainContactPhone: record.mainContactPhone || null,
    counterpartyId: record.counterpartyId,
    companyProfileId: record.companyProfileId || null,
    templateId: record.templateId,
    templateVersion: record.templateVersion,
    intakeFormId: record.intakeFormId ?? null,
    contractVariables: record.contractVariables
      ? toJsonValue(record.contractVariables)
      : undefined,
    stage: record.stage,
    currentStepIndex: record.currentStepIndex,
    workflowSteps: toJsonValue(record.workflowSteps),
    auditTrail: toJsonValue(record.auditTrail),
    attachments: toJsonValue(record.attachments),
    relatedEmails: toJsonValue(record.relatedEmails),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function resolveOrganizationId(record: ContractRecord): string {
  return record.companyProfileId;
}

export async function saveContractRecord(
  record: ContractRecord,
): Promise<void> {
  const prisma = getPrismaClient();
  const organizationId = resolveOrganizationId(record);
  const existing = await prisma.contract.findUnique({
    where: { id: record.id },
  });
  const lifecycle = resolveLifecycleWriteFields(record.stage, existing);
  const data = {
    ...mapRecordToPrismaData(record, organizationId),
    contractStatus: lifecycle.contractStatus,
    ...(lifecycle.activatedAt ? { activatedAt: lifecycle.activatedAt } : {}),
    ...(lifecycle.expiredAt ? { expiredAt: lifecycle.expiredAt } : {}),
  };

  await prisma.contract.upsert({
    where: { id: record.id },
    create: data,
    update: {
      organizationId: data.organizationId,
      recordNumber: data.recordNumber,
      requesterName: data.requesterName,
      requesterEmail: data.requesterEmail,
      department: data.department,
      contractType: data.contractType,
      contractStartDate: data.contractStartDate,
      contractEndDate: data.contractEndDate,
      title: data.title,
      description: data.description,
      amount: data.amount,
      amountNumeric: data.amountNumeric,
      budgeted: data.budgeted,
      poNumber: data.poNumber,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      parentAgreementId: data.parentAgreementId,
      parentAgreementRecordNumber: data.parentAgreementRecordNumber,
      parentAgreementTitle: data.parentAgreementTitle,
      confidential: data.confidential,
      otherNotes: data.otherNotes,
      companyName: data.companyName,
      address: data.address,
      mainContactName: data.mainContactName,
      mainContactTitle: data.mainContactTitle,
      mainContactEmail: data.mainContactEmail,
      mainContactPhone: data.mainContactPhone,
      counterpartyId: data.counterpartyId,
      companyProfileId: data.companyProfileId,
      templateId: data.templateId,
      templateVersion: data.templateVersion,
      intakeFormId: data.intakeFormId,
      contractVariables: data.contractVariables,
      stage: data.stage,
      contractStatus: data.contractStatus,
      ...(data.activatedAt ? { activatedAt: data.activatedAt } : {}),
      ...(data.expiredAt ? { expiredAt: data.expiredAt } : {}),
      currentStepIndex: data.currentStepIndex,
      workflowSteps: data.workflowSteps,
      auditTrail: data.auditTrail,
      attachments: data.attachments,
      relatedEmails: data.relatedEmails,
      updatedAt: data.updatedAt,
    },
  });
}

export async function loadContractRecord(
  id: string,
  organizationId: string,
): Promise<ContractRecord | null> {
  const prisma = getPrismaClient();
  const record = await prisma.contract.findFirst({
    where: {
      id,
      organizationId,
    },
  });

  return record ? mapPrismaContractToRecord(record) : null;
}

async function generateUniqueRecordNumber(): Promise<string> {
  const prisma = getPrismaClient();

  let recordNumber: string;
  let attempts = 0;

  do {
    const random = randomInt(0, 1_000_000);
    recordNumber = `CR-${random.toString().padStart(6, "0")}`;

    const existing = await prisma.contract.findFirst({
      where: { recordNumber },
      select: { id: true },
    });

    if (!existing) {
      break;
    }

    attempts += 1;

    if (attempts > 20) {
      recordNumber = `CR-${Date.now().toString().slice(-6)}`;
      break;
    }
  } while (true);

  return recordNumber;
}

export async function createAndPersistContract(
  input: ContractIntakeInput,
  organizationId: string,
): Promise<ContractRecord> {
  const id = randomUUID();
  const recordNumber = await generateUniqueRecordNumber();
  const record = {
    ...createContractFromIntake(input, { id, recordNumber }),
    companyProfileId: organizationId,
  };

  await saveContractRecord(record);
  return record;
}

export async function approveAndPersist(
  contractId: string,
  organizationId: string,
  approverEmail: string,
  approverName: string,
  note?: string,
): Promise<ContractRecord> {
  const contract = await loadContractRecord(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  const updated = approveContractStep(contract, approverEmail, approverName, note);
  await saveContractRecord(updated);
  return updated;
}

export async function rejectAndPersist(
  contractId: string,
  organizationId: string,
  approverEmail: string,
  approverName: string,
  note?: string,
): Promise<ContractRecord> {
  const contract = await loadContractRecord(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  const updated = rejectContractStep(contract, approverEmail, approverName, note);
  await saveContractRecord(updated);
  return updated;
}

export async function reassignAndPersist(
  contractId: string,
  organizationId: string,
  newAssignee: { email: string; name: string },
  actor: { email: string; name: string },
  note?: string,
): Promise<ContractRecord> {
  const contract = await loadContractRecord(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  const updated = reassignCurrentApprovalStep(
    contract,
    newAssignee,
    actor,
    note,
  );
  await saveContractRecord(updated);
  return updated;
}

export async function assignLegalReviewerAndPersist(
  contractId: string,
  organizationId: string,
  assignee: { email: string; name: string },
  actor: { email: string; name: string },
): Promise<ContractRecord> {
  const contract = await loadMergedContractRecord(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  const updated = assignLegalReviewerStep(contract, assignee, actor);
  await saveContractRecord(updated);
  return updated;
}

export async function listContractRecords(
  organizationId: string,
  filters?: ListContractRecordsFilters,
): Promise<ContractRecord[]> {
  const prisma = getPrismaClient();
  const search = filters?.search?.trim();

  const records = await prisma.contract.findMany({
    where: {
      organizationId,
      ...(filters?.requesterEmail
        ? {
            requesterEmail: {
              equals: filters.requesterEmail,
              mode: "insensitive",
            },
          }
        : {}),
      ...(filters?.stage ? { stage: filters.stage as ContractStage } : {}),
      ...(filters?.contractType ? { contractType: filters.contractType } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { companyName: { contains: search, mode: "insensitive" } },
              { mainContactName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return records.map(mapPrismaContractToRecord);
}

export async function markContractExpired(
  contractId: string,
  organizationId: string,
  actorName: string,
  actorEmail: string,
): Promise<ContractRecord> {
  const contract = await loadContractRecord(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  if (contract.stage !== "active") {
    throw new Error("Only active contracts can be marked expired.");
  }

  const updated: ContractRecord = {
    ...contract,
    stage: "expired",
    auditTrail: [
      ...contract.auditTrail,
      createAuditEvent(
        actorName,
        actorEmail,
        "Contract expired",
        "Contract reached its end date and was marked expired.",
      ),
    ],
    updatedAt: new Date().toISOString(),
  };

  await saveContractRecord(updated);

  const saved = await loadContractRecord(contractId, organizationId);
  if (!saved) {
    throw new Error("Contract not found after update.");
  }

  return saved;
}

export interface InboundContractEmailInput {
  recordNumber?: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  body: string;
  sentAt?: string;
  provider?: "microsoft" | "google" | "webhook";
  providerMessageId?: string;
  direction?: ContractEmailDirection;
}

export async function addContractEmailAndPersist(
  contractId: string,
  organizationId: string,
  input: AddContractEmailInput,
  actor: { name: string; email: string },
): Promise<ContractRecord> {
  const contract = await loadMergedContractRecord(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  if (
    resolveClauseLibraryOrganizationId(contract.companyProfileId) !==
    resolveClauseLibraryOrganizationId(organizationId)
  ) {
    throw new Error("Contract does not belong to this client organization.");
  }

  const updated = appendRelatedEmailToRecord(
    contract,
    input,
    actor.name,
    actor.email,
  );

  if (isDatabaseConfigured()) {
    await saveContractRecord(updated);
    await recordContractAuditLog({
      organizationId: resolveClauseLibraryOrganizationId(contract.companyProfileId),
      entityId: contractId,
      action: "email_captured",
      detail: input.subject.trim(),
      actorEmail: actor.email,
      actorName: actor.name,
      metadata: {
        source: input.source,
        direction: "inbound",
      },
    });
    return updated;
  }

  return addContractEmail(contractId, input, actor.name, actor.email);
}

export async function sendContractEmailAndPersist(
  contractId: string,
  organizationId: string,
  input: SendContractEmailInput,
  actor: { name: string; email: string },
): Promise<ContractRecord> {
  const contract = await loadMergedContractRecord(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  if (
    resolveClauseLibraryOrganizationId(contract.companyProfileId) !==
    resolveClauseLibraryOrganizationId(organizationId)
  ) {
    throw new Error("Contract does not belong to this client organization.");
  }

  const sendResult = await sendContractRecordEmail(
    contract,
    input,
    actor,
    organizationId,
  );
  const timestamp = new Date().toISOString();
  const emailInput = {
    subject: sendResult.subject,
    from: actor.email,
    to: input.to.trim(),
    cc: input.cc?.trim(),
    sentAt: timestamp,
    body: input.body.trim(),
    source: "sent" as const,
    direction: "outbound" as const,
    provider:
      sendResult.provider === "microsoft"
        ? ("microsoft" as const)
        : sendResult.provider === "webhook"
          ? ("webhook" as const)
          : undefined,
    providerMessageId: storeProviderMessageId(sendResult.providerMessageId),
  };

  const updated = appendRelatedEmailToRecord(
    contract,
    emailInput,
    actor.name,
    actor.email,
    "Email sent",
  );

  if (isDatabaseConfigured()) {
    await saveContractRecord(updated);
    await recordContractAuditLog({
      organizationId: resolveClauseLibraryOrganizationId(contract.companyProfileId),
      entityId: contractId,
      action: "email_sent",
      detail: sendResult.subject,
      actorEmail: actor.email,
      actorName: actor.name,
      metadata: {
        to: input.to.trim(),
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId ?? null,
      },
    });
    return updated;
  }

  return addContractEmail(contractId, emailInput, actor.name, actor.email, "Email sent");
}

export async function syncInboundContractEmailAndPersist(
  organizationId: string,
  input: InboundContractEmailInput,
): Promise<{ contractId: string; emailId: string; duplicate: boolean } | null> {
  const recordNumber = input.recordNumber?.trim().toUpperCase();

  if (!recordNumber) {
    return null;
  }

  const resolvedOrganizationId = resolveClauseLibraryOrganizationId(organizationId);
  const located = await resolveOrganizationIdByRecordNumber(recordNumber);

  if (!located) {
    return null;
  }

  if (located.organizationId !== resolvedOrganizationId) {
    throw new Error("Contract record does not belong to this client organization.");
  }

  const contract = await loadMergedContractRecord(
    located.contractId,
    located.organizationId,
  );

  if (!contract) {
    return null;
  }

  const sentAt = input.sentAt ?? new Date().toISOString();
  const normalizedProviderMessageId = storeProviderMessageId(input.providerMessageId);

  if (
    hasMatchingRelatedEmail(contract.relatedEmails, {
      subject: input.subject.trim(),
      from: input.from.trim(),
      to: input.to.trim(),
      sentAt,
      providerMessageId: normalizedProviderMessageId,
    })
  ) {
    const existingEmail = findMatchingRelatedEmail(contract.relatedEmails, {
      subject: input.subject.trim(),
      from: input.from.trim(),
      to: input.to.trim(),
      sentAt,
      providerMessageId: normalizedProviderMessageId,
    });

    return {
      contractId: contract.id,
      emailId: existingEmail?.id ?? "",
      duplicate: true,
    };
  }

  const actorEmail = "system@contractflow.app";
  const actorName = "Email sync";
  const direction = input.direction ?? "inbound";
  const emailInput = {
    subject: input.subject.trim(),
    from: input.from.trim(),
    to: input.to.trim(),
    cc: input.cc?.trim(),
    sentAt,
    body: input.body.trim(),
    source: "provider_sync" as const,
    direction,
    provider: input.provider,
    providerMessageId: normalizedProviderMessageId,
  };
  const auditAction = direction === "outbound" ? "Email sent" : "Email captured";
  const updated = appendRelatedEmailToRecord(
    contract,
    emailInput,
    actorName,
    actorEmail,
    auditAction,
  );
  const capturedEmail = updated.relatedEmails.at(-1);

  if (!capturedEmail) {
    throw new Error("Failed to capture inbound email.");
  }

  if (isDatabaseConfigured()) {
    await saveContractRecord(updated);
    await recordContractAuditLog({
      organizationId: located.organizationId,
      entityId: contract.id,
      action: direction === "outbound" ? "email_sent" : "email_captured",
      detail: input.subject.trim(),
      actorEmail,
      actorName,
      metadata: {
        source: emailInput.source,
        provider: input.provider ?? null,
        providerMessageId: normalizedProviderMessageId ?? null,
        direction,
      },
    });
  } else {
    addContractEmail(
      contract.id,
      emailInput,
      actorName,
      actorEmail,
      auditAction,
    );
  }

  return {
    contractId: contract.id,
    emailId: capturedEmail.id,
    duplicate: false,
  };
}
