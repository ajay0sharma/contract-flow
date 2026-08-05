import {
  approveContractStep,
  assignLegalReviewerStep,
  createContractFromIntake,
  getCurrentApprover,
  isAwaitingApproval,
  parseContractAmount,
  rejectContractStep,
  resolveWorkflowSteps,
  activateContract,
} from "@/lib/workflow-engine";
import {
  canViewAllContractRecords,
  isAdminEmail,
  isLegalEmail,
  isSupportEmail,
} from "@/lib/access-control";
import {
  allocateContractRecordIdentity,
  normalizeContractRecordLookup,
  resolveContractRecordNumber,
} from "@/lib/record-id";
import { assertMemoryPersistenceAllowed } from "@/lib/persistence-mode";
import type {
  AppendContractEmailInput,
  ContractAttachment,
  ContractEmail,
  ContractIntakeAttachmentInput,
  ContractIntakeInput,
  ContractRecord,
  ContractRecordUpdateInput,
  ContractStage,
} from "@/types/contract";
import { safeTrim } from "@/lib/string-utils";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeAttachment(attachment: ContractAttachment): ContractAttachment {
  return {
    ...attachment,
    title: attachment.title ?? attachment.fileName ?? "Untitled document",
    fileName: attachment.fileName ?? attachment.title ?? "document",
    uploadedByName: attachment.uploadedByName ?? "Unknown user",
    uploadedByEmail: attachment.uploadedByEmail ?? "",
    dataBase64: attachment.dataBase64 ?? "",
  };
}

function normalizeRelatedEmail(email: ContractEmail): ContractEmail {
  return {
    ...email,
    cc: email.cc ?? "",
    direction: email.direction ?? "inbound",
    emlDataBase64: email.emlDataBase64 ?? "",
  };
}

function createRelatedEmail(
  input: AppendContractEmailInput,
  actorName: string,
  actorEmail: string,
): ContractEmail {
  const timestamp = new Date().toISOString();

  return normalizeRelatedEmail({
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    subject: input.subject.trim(),
    from: input.from.trim(),
    to: input.to.trim(),
    cc: input.cc?.trim() ?? "",
    sentAt: input.sentAt,
    body: input.body.trim(),
    source: input.source,
    direction: input.direction ?? "inbound",
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    addedByName: actorName,
    addedByEmail: actorEmail,
    addedAt: timestamp,
    emlFileName: input.emlFileName,
    emlDataBase64: input.emlDataBase64,
  });
}

export function appendRelatedEmailToRecord(
  contract: ContractRecord,
  input: AppendContractEmailInput,
  actorName: string,
  actorEmail: string,
  auditAction = "Email captured",
): ContractRecord {
  const timestamp = new Date().toISOString();
  const email = createRelatedEmail(input, actorName, actorEmail);

  return normalizeContractRecord({
    ...contract,
    relatedEmails: [...(contract.relatedEmails ?? []), email],
    auditTrail: [
      ...contract.auditTrail,
      {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp,
        actorName,
        actorEmail,
        action: auditAction,
        detail: `${input.subject.trim()} (${input.source.replaceAll("_", " ")})`,
      },
    ],
    updatedAt: timestamp,
  });
}

export function normalizeContractRecord(
  contract: ContractRecord,
): ContractRecord {
  return {
    ...contract,
    recordNumber: contract.recordNumber ?? contract.id.toUpperCase(),
    attachments: (contract.attachments ?? []).map(normalizeAttachment),
    relatedEmails: (contract.relatedEmails ?? []).map(normalizeRelatedEmail),
    auditTrail: contract.auditTrail ?? [],
    budgeted: contract.budgeted ?? null,
    poNumber: contract.poNumber ?? "",
    supplierId: contract.supplierId ?? "",
    supplierName: contract.supplierName ?? "",
    parentAgreementId: contract.parentAgreementId ?? null,
    parentAgreementRecordNumber: contract.parentAgreementRecordNumber ?? "",
    parentAgreementTitle: contract.parentAgreementTitle ?? "",
    templateId: contract.templateId ?? null,
    templateVersion: contract.templateVersion ?? null,
    confidential: contract.confidential ?? false,
    counterpartyId: contract.counterpartyId ?? null,
    mainContactName: contract.mainContactName ?? "",
    mainContactTitle: contract.mainContactTitle ?? "",
    mainContactEmail: contract.mainContactEmail ?? "",
    mainContactPhone: contract.mainContactPhone ?? "",
  };
}

function buildSeedContract(
  partial: Omit<
    ContractRecord,
    | "workflowSteps"
    | "currentStepIndex"
    | "auditTrail"
    | "attachments"
    | "budgeted"
    | "recordNumber"
    | "relatedEmails"
    | "poNumber"
    | "supplierId"
    | "supplierName"
    | "parentAgreementId"
    | "parentAgreementRecordNumber"
    | "parentAgreementTitle"
    | "templateId"
    | "templateVersion"
    | "confidential"
    | "counterpartyId"
  > & {
    workflowStepStatuses: Array<
      "completed" | "current" | "upcoming" | "rejected" | "skipped"
    >;
    auditTrail: ContractRecord["auditTrail"];
    attachments?: ContractRecord["attachments"];
    relatedEmails?: ContractRecord["relatedEmails"];
    budgeted?: boolean | null;
    poNumber?: string;
    supplierId?: string;
    supplierName?: string;
    parentAgreementId?: string | null;
    parentAgreementRecordNumber?: string;
    parentAgreementTitle?: string;
    templateId?: string | null;
    templateVersion?: number | null;
    confidential?: boolean;
    counterpartyId?: string | null;
    recordNumber?: string;
  },
): ContractRecord {
  const workflowSteps = resolveWorkflowSteps(
    partial.amountNumeric,
    partial.department,
  ).map(
    (step, index) => ({
      ...step,
      status: partial.workflowStepStatuses[index] ?? "upcoming",
      completedAt:
        partial.workflowStepStatuses[index] === "completed" ||
        partial.workflowStepStatuses[index] === "rejected"
          ? partial.updatedAt
          : undefined,
    }),
  );

  const currentStepIndex = workflowSteps.findIndex(
    (step) => step.status === "current",
  );

  return {
    ...partial,
    recordNumber: partial.recordNumber ?? partial.id.toUpperCase(),
    attachments: partial.attachments ?? [],
    relatedEmails: partial.relatedEmails ?? [],
    budgeted: partial.budgeted ?? null,
    poNumber: partial.poNumber ?? "",
    supplierId: partial.supplierId ?? "",
    supplierName: partial.supplierName ?? "",
    parentAgreementId: partial.parentAgreementId ?? null,
    parentAgreementRecordNumber: partial.parentAgreementRecordNumber ?? "",
    parentAgreementTitle: partial.parentAgreementTitle ?? "",
    templateId: partial.templateId ?? null,
    templateVersion: partial.templateVersion ?? null,
    confidential: partial.confidential ?? false,
    counterpartyId: partial.counterpartyId ?? null,
    workflowSteps,
    currentStepIndex: currentStepIndex === -1 ? workflowSteps.length : currentStepIndex,
    auditTrail: partial.auditTrail,
  };
}

const seedContracts: ContractRecord[] = [
  buildSeedContract({
    id: "ctr-1042",
    requesterName: "Jordan Lee",
    requesterEmail: "jordan@example.com",
    department: "Sales",
    contractType: "Master Services Agreement",
    contractStartDate: "2026-07-01",
    contractEndDate: "2027-06-30",
    title: "Master Services Agreement — Acme Corp",
    description: "Annual MSA covering professional services and support SLAs.",
    amount: "$240,000",
    amountNumeric: 240000,
    budgeted: true,
    poNumber: "PO-2026-11842",
    otherNotes: "Includes renewal option.",
    companyName: "Acme Corp",
    address: "500 Market Street, San Francisco, CA",
    mainContactName: "Jane Smith",
    mainContactTitle: "Director of Procurement",
    mainContactEmail: "jane@acme.com",
    mainContactPhone: "+1 (415) 555-0142",
    counterpartyId: "cp-acme",
    companyProfileId: "default",
    stage: "finance_review",
    createdAt: "2026-06-12T10:00:00.000Z",
    updatedAt: "2026-06-20",
    workflowStepStatuses: ["completed", "current", "upcoming"],
    auditTrail: [
      {
        id: "audit-1042-1",
        timestamp: "2026-06-12T10:00:00.000Z",
        actorName: "Jordan Lee",
        actorEmail: "jordan@example.com",
        action: "Request submitted",
        detail: "Contract intake completed and routed into the approval workflow.",
      },
      {
        id: "audit-1042-1b",
        timestamp: "2026-06-12T10:01:00.000Z",
        actorName: "Jordan Lee",
        actorEmail: "jordan@example.com",
        action: "Document uploaded",
        detail: "Quote/Proposal: Acme-MSA-Quote-2026.pdf",
      },
      {
        id: "audit-1042-1c",
        timestamp: "2026-06-12T10:02:00.000Z",
        actorName: "Jordan Lee",
        actorEmail: "jordan@example.com",
        action: "Document uploaded",
        detail: "Supporting Document: Acme-W9.pdf",
      },
      {
        id: "audit-1042-2",
        timestamp: "2026-06-14T15:00:00.000Z",
        actorName: "Ajay Sharma",
        actorEmail: "ajay.sharma.jd@gmail.com",
        action: "Approved",
        detail: "Legal Review completed.",
      },
      {
        id: "audit-1042-3",
        timestamp: "2026-06-14T15:01:00.000Z",
        actorName: "Workflow Engine",
        actorEmail: "system@contract-app.local",
        action: "Routed",
        detail: "Contract sent to Finance Review (Marcus Chen).",
      },
    ],
    attachments: [
      {
        id: "att-1042-1",
        title: "Acme-MSA-Quote-2026.pdf",
        fileName: "Acme-MSA-Quote-2026.pdf",
        mimeType: "application/pdf",
        sizeBytes: 248000,
        documentType: "quote_proposal",
        uploadedAt: "2026-06-12T10:01:00.000Z",
        uploadedByName: "Jordan Lee",
        uploadedByEmail: "jordan@example.com",
        dataBase64: "",
      },
      {
        id: "att-1042-2",
        title: "Acme-W9.pdf",
        fileName: "Acme-W9.pdf",
        mimeType: "application/pdf",
        sizeBytes: 92000,
        documentType: "w9",
        uploadedAt: "2026-06-12T10:02:00.000Z",
        uploadedByName: "Jordan Lee",
        uploadedByEmail: "jordan@example.com",
        dataBase64: "",
      },
    ],
    relatedEmails: [
      {
        id: "email-1042-1",
        subject: "Re: Acme MSA pricing and SLA terms",
        from: "Jane Smith <jane@acme.com>",
        to: "jordan@example.com",
        cc: "legal@acme.com",
        sentAt: "2026-06-11T14:30:00.000Z",
        body: "Attached our latest quote and standard SLA language for your review before we finalize the agreement.",
        source: "manual",
        addedByName: "Jordan Lee",
        addedByEmail: "jordan@example.com",
        addedAt: "2026-06-12T10:00:00.000Z",
      },
    ],
  }),
  buildSeedContract({
    id: "ctr-1038",
    requesterName: "Jordan Lee",
    requesterEmail: "jordan@example.com",
    department: "Sales",
    contractType: "Non-Disclosure Agreement",
    contractStartDate: "2026-06-01",
    contractEndDate: "2028-05-31",
    title: "NDA — Brightline Analytics",
    description: "Mutual NDA for data partnership evaluation.",
    amount: "$0",
    amountNumeric: 0,
    otherNotes: "",
    companyName: "Brightline Analytics",
    address: "1200 Pine Street, Seattle, WA",
    mainContactName: "Alex Kim",
    mainContactTitle: "Head of Partnerships",
    mainContactEmail: "alex@brightline.com",
    mainContactPhone: "+1 (206) 555-0198",
    companyProfileId: "default",
    stage: "active",
    createdAt: "2026-06-08T09:00:00.000Z",
    updatedAt: "2026-06-18",
    workflowStepStatuses: ["completed"],
    auditTrail: [
      {
        id: "audit-1038-1",
        timestamp: "2026-06-08T09:00:00.000Z",
        actorName: "Jordan Lee",
        actorEmail: "jordan@example.com",
        action: "Request submitted",
        detail: "Contract intake completed and routed into the approval workflow.",
      },
      {
        id: "audit-1038-2",
        timestamp: "2026-06-18T11:00:00.000Z",
        actorName: "Ajay Sharma",
        actorEmail: "ajay.sharma.jd@gmail.com",
        action: "Approved",
        detail: "Legal Review completed.",
      },
      {
        id: "audit-1038-3",
        timestamp: "2026-06-18T11:30:00.000Z",
        actorName: "Jordan Lee",
        actorEmail: "jordan@example.com",
        action: "Executed",
        detail: "Contract marked as signed and active.",
      },
    ],
  }),
  buildSeedContract({
    id: "ctr-1031",
    requesterName: "Sam Rivera",
    requesterEmail: "sam@example.com",
    department: "Procurement",
    contractType: "Vendor Agreement",
    contractStartDate: "2026-08-01",
    contractEndDate: "2027-07-31",
    title: "Vendor Agreement — CloudHost Pro",
    description: "Infrastructure hosting agreement with 12-month term.",
    amount: "$48,000",
    amountNumeric: 48000,
    otherNotes: "",
    companyName: "CloudHost Pro",
    address: "44 Cloud Way, Austin, TX",
    mainContactName: "Chris Lee",
    mainContactTitle: "Account Executive",
    mainContactEmail: "chris@cloudhost.com",
    mainContactPhone: "",
    companyProfileId: "default",
    stage: "finance_review",
    createdAt: "2026-06-15T08:00:00.000Z",
    updatedAt: "2026-06-17",
    workflowStepStatuses: ["completed", "current"],
    auditTrail: [
      {
        id: "audit-1031-1",
        timestamp: "2026-06-15T08:00:00.000Z",
        actorName: "Sam Rivera",
        actorEmail: "sam@example.com",
        action: "Request submitted",
        detail: "Contract intake completed and routed into the approval workflow.",
      },
      {
        id: "audit-1031-2",
        timestamp: "2026-06-16T12:00:00.000Z",
        actorName: "Ajay Sharma",
        actorEmail: "ajay.sharma.jd@gmail.com",
        action: "Approved",
        detail: "Legal Review completed.",
      },
    ],
  }),
  buildSeedContract({
    id: "ctr-1024",
    requesterName: "Alex Kim",
    requesterEmail: "alex@example.com",
    department: "Engineering",
    contractType: "Statement of Work",
    contractStartDate: "2026-07-15",
    contractEndDate: "2026-12-31",
    title: "Statement of Work — Northwind Labs",
    description: "Custom development SOW with milestone billing.",
    amount: "$92,500",
    amountNumeric: 92500,
    otherNotes: "Requires security review addendum.",
    companyName: "Northwind Labs",
    address: "88 Harbor Road, Boston, MA",
    mainContactName: "Taylor Reed",
    mainContactTitle: "General Counsel",
    mainContactEmail: "taylor@northwind.com",
    mainContactPhone: "+1 (617) 555-0133",
    companyProfileId: "acme",
    stage: "legal_review",
    createdAt: "2026-06-08T14:00:00.000Z",
    updatedAt: "2026-06-15",
    workflowStepStatuses: ["current", "upcoming"],
    auditTrail: [
      {
        id: "audit-1024-1",
        timestamp: "2026-06-08T14:00:00.000Z",
        actorName: "Alex Kim",
        actorEmail: "alex@example.com",
        action: "Request submitted",
        detail: "Contract intake completed and routed into the approval workflow.",
      },
    ],
  }),
  buildSeedContract({
    id: "ctr-1012",
    requesterName: "Sam Rivera",
    requesterEmail: "sam@example.com",
    department: "Operations",
    contractType: "Support Renewal",
    contractStartDate: "2026-05-01",
    contractEndDate: "2027-04-30",
    title: "Support Renewal — Atlas Systems",
    description: "Annual support renewal for enterprise platform.",
    amount: "$31,200",
    amountNumeric: 31200,
    otherNotes: "",
    companyName: "Atlas Systems",
    address: "300 State Street, Chicago, IL",
    mainContactName: "Morgan Lee",
    mainContactTitle: "VP, Commercial Operations",
    mainContactEmail: "morgan@atlas.com",
    mainContactPhone: "+1 (312) 555-0177",
    companyProfileId: "default",
    stage: "rejected",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-10",
    workflowStepStatuses: ["completed", "rejected"],
    auditTrail: [
      {
        id: "audit-1012-1",
        timestamp: "2026-06-01T10:00:00.000Z",
        actorName: "Sam Rivera",
        actorEmail: "sam@example.com",
        action: "Request submitted",
        detail: "Contract intake completed and routed into the approval workflow.",
      },
      {
        id: "audit-1012-2",
        timestamp: "2026-06-09T09:00:00.000Z",
        actorName: "Ajay Sharma",
        actorEmail: "ajay.sharma.jd@gmail.com",
        action: "Approved",
        detail: "Legal Review completed.",
      },
      {
        id: "audit-1012-3",
        timestamp: "2026-06-10T16:00:00.000Z",
        actorName: "Marcus Chen",
        actorEmail: "marcus@example.com",
        action: "Rejected",
        detail: "Finance Review rejected: Budget cap exceeded for Q2.",
      },
    ],
  }),
  buildSeedContract({
    id: "ctr-1050",
    requesterName: "Jordan Lee",
    requesterEmail: "jordan@example.com",
    department: "Sales",
    contractType: "Master Services Agreement",
    contractStartDate: "2025-01-01",
    contractEndDate: "2027-12-31",
    title: "Enterprise Master Services Agreement — Summit Retail Group",
    description:
      "Umbrella MSA governing professional services, change orders, and work orders across retail operations.",
    amount: "$750,000",
    amountNumeric: 750000,
    budgeted: true,
    poNumber: "PO-2025-90010",
    otherNotes: "Parent agreement for linked SOWs and work orders.",
    companyName: "Summit Retail Group",
    address: "2200 Commerce Drive, Denver, CO",
    mainContactName: "Patricia Nguyen",
    mainContactTitle: "VP, Strategic Sourcing",
    mainContactEmail: "patricia.nguyen@summitretail.com",
    mainContactPhone: "+1 (303) 555-0105",
    counterpartyId: "cp-summit",
    companyProfileId: "default",
    stage: "active",
    createdAt: "2025-11-15T10:00:00.000Z",
    updatedAt: "2026-01-10",
    workflowStepStatuses: ["completed", "completed", "completed", "completed"],
    auditTrail: [
      {
        id: "audit-1050-1",
        timestamp: "2025-11-15T10:00:00.000Z",
        actorName: "Jordan Lee",
        actorEmail: "jordan@example.com",
        action: "Request submitted",
        detail: "Parent MSA submitted for approval.",
      },
      {
        id: "audit-1050-2",
        timestamp: "2026-01-08T14:00:00.000Z",
        actorName: "Ajay Sharma",
        actorEmail: "ajay.sharma.jd@gmail.com",
        action: "Approved",
        detail: "Legal Review completed.",
      },
      {
        id: "audit-1050-3",
        timestamp: "2026-01-10T09:00:00.000Z",
        actorName: "Jordan Lee",
        actorEmail: "jordan@example.com",
        action: "Executed",
        detail: "MSA marked as signed and active.",
      },
    ],
    attachments: [
      {
        id: "att-1050-1",
        title: "Summit Retail MSA - Fully Executed.pdf",
        fileName: "Summit Retail MSA - Fully Executed.pdf",
        mimeType: "application/pdf",
        sizeBytes: 248000,
        documentType: "fully_executed_agreement",
        uploadedAt: "2026-01-10T09:00:00.000Z",
        uploadedByName: "Jordan Lee",
        uploadedByEmail: "jordan@example.com",
        dataBase64: "",
      },
    ],
  }),
  buildSeedContract({
    id: "ctr-1051",
    requesterName: "Sam Rivera",
    requesterEmail: "sam@example.com",
    department: "Operations",
    contractType: "Statement of Work",
    contractStartDate: "2026-02-01",
    contractEndDate: "2026-08-31",
    title: "Implementation SOW — Store Rollout Phase 1",
    description:
      "Child SOW under the Summit Retail MSA covering POS rollout for 120 locations.",
    amount: "$185,000",
    amountNumeric: 185000,
    budgeted: true,
    poNumber: "PO-2026-22001",
    otherNotes: "Linked to CTR-1050.",
    companyName: "Summit Retail Group",
    address: "2200 Commerce Drive, Denver, CO",
    mainContactName: "Patricia Nguyen",
    mainContactTitle: "VP, Strategic Sourcing",
    mainContactEmail: "patricia.nguyen@summitretail.com",
    mainContactPhone: "+1 (303) 555-0105",
    counterpartyId: "cp-summit",
    companyProfileId: "default",
    parentAgreementId: "ctr-1050",
    parentAgreementRecordNumber: "CTR-1050",
    parentAgreementTitle: "Enterprise Master Services Agreement — Summit Retail Group",
    stage: "active",
    createdAt: "2026-01-20T11:00:00.000Z",
    updatedAt: "2026-02-05",
    workflowStepStatuses: ["completed", "completed", "completed", "completed"],
    auditTrail: [
      {
        id: "audit-1051-1",
        timestamp: "2026-01-20T11:00:00.000Z",
        actorName: "Sam Rivera",
        actorEmail: "sam@example.com",
        action: "Request submitted",
        detail: "Child SOW linked to parent record CTR-1050.",
      },
      {
        id: "audit-1051-2",
        timestamp: "2026-02-04T16:00:00.000Z",
        actorName: "Ajay Sharma",
        actorEmail: "ajay.sharma.jd@gmail.com",
        action: "Approved",
        detail: "Legal Review completed.",
      },
      {
        id: "audit-1051-3",
        timestamp: "2026-02-05T10:00:00.000Z",
        actorName: "Sam Rivera",
        actorEmail: "sam@example.com",
        action: "Executed",
        detail: "SOW marked as signed and active.",
      },
    ],
  }),
  buildSeedContract({
    id: "ctr-1052",
    requesterName: "Alex Kim",
    requesterEmail: "alex@example.com",
    department: "Engineering",
    contractType: "Work Order",
    contractStartDate: "2026-03-01",
    contractEndDate: "2026-05-31",
    title: "Work Order — Data Warehouse Migration Support",
    description:
      "Child work order for ETL migration services under the Summit Retail MSA.",
    amount: "$62,500",
    amountNumeric: 62500,
    budgeted: true,
    poNumber: "PO-2026-22018",
    otherNotes: "Linked to CTR-1050.",
    companyName: "Summit Retail Group",
    address: "2200 Commerce Drive, Denver, CO",
    mainContactName: "Patricia Nguyen",
    mainContactTitle: "VP, Strategic Sourcing",
    mainContactEmail: "patricia.nguyen@summitretail.com",
    mainContactPhone: "+1 (303) 555-0105",
    counterpartyId: "cp-summit",
    companyProfileId: "default",
    parentAgreementId: "ctr-1050",
    parentAgreementRecordNumber: "CTR-1050",
    parentAgreementTitle: "Enterprise Master Services Agreement — Summit Retail Group",
    stage: "active",
    createdAt: "2026-02-10T09:30:00.000Z",
    updatedAt: "2026-02-18",
    workflowStepStatuses: ["completed", "completed", "completed"],
    auditTrail: [
      {
        id: "audit-1052-1",
        timestamp: "2026-02-10T09:30:00.000Z",
        actorName: "Alex Kim",
        actorEmail: "alex@example.com",
        action: "Request submitted",
        detail: "Child work order linked to parent record CTR-1050.",
      },
      {
        id: "audit-1052-2",
        timestamp: "2026-02-17T13:00:00.000Z",
        actorName: "Ajay Sharma",
        actorEmail: "ajay.sharma.jd@gmail.com",
        action: "Approved",
        detail: "Legal Review completed.",
      },
      {
        id: "audit-1052-3",
        timestamp: "2026-02-18T08:30:00.000Z",
        actorName: "Alex Kim",
        actorEmail: "alex@example.com",
        action: "Executed",
        detail: "Work order marked as signed and active.",
      },
    ],
  }),
  buildSeedContract({
    id: "ctr-1053",
    requesterName: "Jordan Lee",
    requesterEmail: "jordan@example.com",
    department: "Sales",
    contractType: "Amendment",
    contractStartDate: "2026-04-01",
    contractEndDate: "2027-12-31",
    title: "Amendment No. 1 — Extended Support Coverage",
    description:
      "Amendment extending premium support hours under the Summit Retail MSA.",
    amount: "$24,000",
    amountNumeric: 24000,
    budgeted: true,
    poNumber: "PO-2026-22044",
    otherNotes: "Linked to CTR-1050.",
    companyName: "Summit Retail Group",
    address: "2200 Commerce Drive, Denver, CO",
    mainContactName: "Patricia Nguyen",
    mainContactTitle: "VP, Strategic Sourcing",
    mainContactEmail: "patricia.nguyen@summitretail.com",
    mainContactPhone: "+1 (303) 555-0105",
    counterpartyId: "cp-summit",
    companyProfileId: "default",
    parentAgreementId: "ctr-1050",
    parentAgreementRecordNumber: "CTR-1050",
    parentAgreementTitle: "Enterprise Master Services Agreement — Summit Retail Group",
    stage: "active",
    createdAt: "2026-03-05T15:00:00.000Z",
    updatedAt: "2026-03-12",
    workflowStepStatuses: ["completed", "completed"],
    auditTrail: [
      {
        id: "audit-1053-1",
        timestamp: "2026-03-05T15:00:00.000Z",
        actorName: "Jordan Lee",
        actorEmail: "jordan@example.com",
        action: "Request submitted",
        detail: "Amendment linked to parent record CTR-1050.",
      },
      {
        id: "audit-1053-2",
        timestamp: "2026-03-11T11:00:00.000Z",
        actorName: "Ajay Sharma",
        actorEmail: "ajay.sharma.jd@gmail.com",
        action: "Approved",
        detail: "Legal Review completed.",
      },
      {
        id: "audit-1053-3",
        timestamp: "2026-03-12T09:15:00.000Z",
        actorName: "Jordan Lee",
        actorEmail: "jordan@example.com",
        action: "Executed",
        detail: "Amendment marked as signed and active.",
      },
    ],
  }),
  buildSeedContract({
    id: "ctr-1054",
    requesterName: "Sam Rivera",
    requesterEmail: "sam@example.com",
    department: "Operations",
    contractType: "Change Order",
    contractStartDate: "2026-05-01",
    contractEndDate: "2026-08-31",
    title: "Change Order — Additional Training Hours",
    description:
      "Nested change order under the Phase 1 implementation SOW for store staff training.",
    amount: "$18,750",
    amountNumeric: 18750,
    budgeted: true,
    poNumber: "PO-2026-22077",
    otherNotes: "Linked to CTR-1051.",
    companyName: "Summit Retail Group",
    address: "2200 Commerce Drive, Denver, CO",
    mainContactName: "Patricia Nguyen",
    mainContactTitle: "VP, Strategic Sourcing",
    mainContactEmail: "patricia.nguyen@summitretail.com",
    mainContactPhone: "+1 (303) 555-0105",
    counterpartyId: "cp-summit",
    companyProfileId: "default",
    parentAgreementId: "ctr-1051",
    parentAgreementRecordNumber: "CTR-1051",
    parentAgreementTitle: "Implementation SOW — Store Rollout Phase 1",
    stage: "active",
    createdAt: "2026-04-02T10:00:00.000Z",
    updatedAt: "2026-04-09",
    workflowStepStatuses: ["completed", "completed"],
    auditTrail: [
      {
        id: "audit-1054-1",
        timestamp: "2026-04-02T10:00:00.000Z",
        actorName: "Sam Rivera",
        actorEmail: "sam@example.com",
        action: "Request submitted",
        detail: "Change order linked to parent record CTR-1051.",
      },
      {
        id: "audit-1054-2",
        timestamp: "2026-04-08T14:00:00.000Z",
        actorName: "Ajay Sharma",
        actorEmail: "ajay.sharma.jd@gmail.com",
        action: "Approved",
        detail: "Legal Review completed.",
      },
      {
        id: "audit-1054-3",
        timestamp: "2026-04-09T11:00:00.000Z",
        actorName: "Sam Rivera",
        actorEmail: "sam@example.com",
        action: "Executed",
        detail: "Change order marked as signed and active.",
      },
    ],
  }),
];

const globalStore = globalThis as typeof globalThis & {
  __contractStore?: ContractRecord[];
};

function syncSeedContracts(store: ContractRecord[]): ContractRecord[] {
  const existingIds = new Set(store.map((contract) => contract.id));
  const missingSeeds = seedContracts.filter((seed) => !existingIds.has(seed.id));

  if (missingSeeds.length === 0) {
    return store;
  }

  return [
    ...store,
    ...missingSeeds.map((seed) => normalizeContractRecord(seed)),
  ];
}

function getStore(): ContractRecord[] {
  assertMemoryPersistenceAllowed("In-memory contract storage");
  if (!globalStore.__contractStore) {
    globalStore.__contractStore = seedContracts.map(normalizeContractRecord);
  } else {
    globalStore.__contractStore = syncSeedContracts(globalStore.__contractStore);
  }

  return globalStore.__contractStore;
}

export function getAllContracts(): ContractRecord[] {
  return [...getStore()]
    .map(normalizeContractRecord)
    .sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function canViewContractRecord(
  contract: ContractRecord,
  email: string,
): boolean {
  if (!contract.confidential) {
    return true;
  }

  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return false;
  }

  return (
    normalizeEmail(contract.requesterEmail) === normalizedEmail ||
    isLegalEmail(email) ||
    isAdminEmail(email) ||
    isSupportEmail(email)
  );
}

export function getContractsVisibleTo(email: string): ContractRecord[] {
  return getAllContracts().filter((contract) =>
    canViewContractRecord(contract, email),
  );
}

export function getContractById(id: string): ContractRecord | undefined {
  const contract = getStore().find((entry) => entry.id === id);

  return contract ? normalizeContractRecord(contract) : undefined;
}

export function getContractByRecordLookup(
  recordLookup: string,
): ContractRecord | undefined {
  const normalizedLookup = normalizeContractRecordLookup(recordLookup);

  if (!normalizedLookup) {
    return undefined;
  }

  const contract = getStore().find((entry) => {
    const normalized = normalizeContractRecord(entry);
    return (
      normalizeContractRecordLookup(normalized.id) === normalizedLookup ||
      normalizeContractRecordLookup(normalized.recordNumber) ===
        normalizedLookup ||
      normalizeContractRecordLookup(resolveContractRecordNumber(normalized)) ===
        normalizedLookup
    );
  });

  return contract ? normalizeContractRecord(contract) : undefined;
}

export function getContractsRequestedBy(email: string): ContractRecord[] {
  const normalized = normalizeEmail(email);

  if (canViewAllContractRecords(email)) {
    return getContractsVisibleTo(email);
  }

  return getContractsVisibleTo(email).filter(
    (contract) => normalizeEmail(contract.requesterEmail) === normalized,
  );
}

export function getContractsPendingApprovalBy(
  email: string,
): ContractRecord[] {
  const normalized = normalizeEmail(email);

  return getContractsVisibleTo(email).filter((contract) => {
    if (!isAwaitingApproval(contract)) {
      return false;
    }

    const current = getCurrentApprover(contract);
    return (
      current !== null &&
      normalizeEmail(current.assigneeEmail) === normalized
    );
  });
}

export function getContractsByStage(stage: ContractStage): ContractRecord[] {
  return getAllContracts().filter((contract) => contract.stage === stage);
}

const IN_PROGRESS_CONTRACT_STAGES: ContractStage[] = [
  "request",
  "legal_review",
  "vp_review",
  "finance_review",
  "executive_signoff",
  "awaiting_signature",
];

export function countInProgressContractsUsingTemplate(
  templateId: string,
): number {
  return getStore().filter(
    (contract) =>
      contract.templateId === templateId &&
      IN_PROGRESS_CONTRACT_STAGES.includes(contract.stage),
  ).length;
}

export function getActiveParentAgreementOptions(
  parentAgreementTypes: string[],
  viewerEmail?: string,
): ContractRecord[] {
  const allowedTypes = new Set(parentAgreementTypes);

  if (allowedTypes.size === 0) {
    return [];
  }

  const contracts = viewerEmail
    ? getContractsVisibleTo(viewerEmail)
    : getAllContracts();

  return contracts
    .filter(
      (contract) =>
        contract.stage === "active" && allowedTypes.has(contract.contractType),
    )
    .sort((a, b) => {
      const recordCompare = resolveContractRecordNumber(a).localeCompare(
        resolveContractRecordNumber(b),
      );

      return recordCompare !== 0
        ? recordCompare
        : a.title.localeCompare(b.title);
    });
}

export function getPipelineCounts(email: string): {
  myRequests: number;
  pendingMyApproval: number;
  inWorkflow: number;
  awaitingSignature: number;
  active: number;
} {
  const myRequests = getContractsRequestedBy(email);
  const pendingMyApproval = getContractsPendingApprovalBy(email);

  return {
    myRequests: myRequests.length,
    pendingMyApproval: pendingMyApproval.length,
    inWorkflow: myRequests.filter((contract) => isAwaitingApproval(contract))
      .length,
    awaitingSignature: myRequests.filter(
      (contract) => contract.stage === "awaiting_signature",
    ).length,
    active: myRequests.filter((contract) => contract.stage === "active").length,
  };
}

export function submitContractIntake(
  input: ContractIntakeInput,
): ContractRecord {
  const store = getStore();
  const identity = allocateContractRecordIdentity(store);
  const parentAgreement = input.parentAgreementId
    ? store.find((contract) => contract.id === input.parentAgreementId)
    : undefined;
  const contract = normalizeContractRecord(
    createContractFromIntake(input, identity),
  );
  const linkedContract = normalizeContractRecord({
    ...contract,
    parentAgreementId: parentAgreement?.id ?? null,
    parentAgreementRecordNumber: parentAgreement
      ? resolveContractRecordNumber(parentAgreement)
      : "",
    parentAgreementTitle: parentAgreement?.title ?? "",
  });
  store.unshift(linkedContract);
  return linkedContract;
}

export function approveContract(
  contractId: string,
  approverEmail: string,
  approverName: string,
  note?: string,
): ContractRecord {
  const store = getStore();
  const index = store.findIndex((contract) => contract.id === contractId);

  if (index === -1) {
    throw new Error("Contract not found.");
  }

  const updated = approveContractStep(
    store[index],
    approverEmail,
    approverName,
    note,
  );
  store[index] = normalizeContractRecord(updated);
  return store[index];
}

export function rejectContract(
  contractId: string,
  approverEmail: string,
  approverName: string,
  note?: string,
): ContractRecord {
  const store = getStore();
  const index = store.findIndex((contract) => contract.id === contractId);

  if (index === -1) {
    throw new Error("Contract not found.");
  }

  const updated = rejectContractStep(
    store[index],
    approverEmail,
    approverName,
    note,
  );
  store[index] = normalizeContractRecord(updated);
  return store[index];
}

export function markContractActive(
  contractId: string,
  actorName: string,
  actorEmail: string,
): ContractRecord {
  const store = getStore();
  const index = store.findIndex((contract) => contract.id === contractId);

  if (index === -1) {
    throw new Error("Contract not found.");
  }

  const updated = activateContract(store[index], actorName, actorEmail);
  store[index] = normalizeContractRecord(updated);
  return store[index];
}

export function assignContractLegalReviewer(
  contractId: string,
  assignee: { email: string; name: string },
  actor: { email: string; name: string },
): ContractRecord {
  const store = getStore();
  const index = store.findIndex((contract) => contract.id === contractId);

  if (index === -1) {
    throw new Error("Contract not found.");
  }

  const updated = assignLegalReviewerStep(
    normalizeContractRecord(store[index]),
    assignee,
    actor,
  );

  store[index] = updated;
  return updated;
}

export function updateContractRecordDetails(
  contractId: string,
  input: ContractRecordUpdateInput,
  actor: { email: string; name: string },
): ContractRecord {
  const store = getStore();
  const index = store.findIndex((contract) => contract.id === contractId);

  if (index === -1) {
    throw new Error("Contract not found.");
  }

  const requiredFields = [
    input.department,
    input.contractType,
    input.contractStartDate,
    input.contractEndDate,
    input.title,
    input.description,
    input.companyName,
    input.address,
    input.mainContactName,
    input.mainContactEmail,
  ];

  if (requiredFields.some((value) => !safeTrim(value))) {
    throw new Error("Complete all required contract and counterparty fields.");
  }

  const timestamp = new Date().toISOString();
  const amount = safeTrim(input.amount);
  const updated = normalizeContractRecord({
    ...store[index],
    department: safeTrim(input.department),
    contractType: safeTrim(input.contractType),
    contractStartDate: safeTrim(input.contractStartDate),
    contractEndDate: safeTrim(input.contractEndDate),
    title: safeTrim(input.title),
    description: safeTrim(input.description),
    amount,
    amountNumeric: parseContractAmount(amount),
    budgeted: amount ? input.budgeted : null,
    poNumber: amount ? safeTrim(input.poNumber) : "",
    supplierId: amount ? safeTrim(input.supplierId) : "",
    supplierName: amount ? safeTrim(input.supplierName) : "",
    otherNotes: safeTrim(input.otherNotes),
    companyName: safeTrim(input.companyName),
    address: safeTrim(input.address),
    mainContactName: safeTrim(input.mainContactName),
    mainContactTitle: safeTrim(input.mainContactTitle),
    mainContactEmail: safeTrim(input.mainContactEmail),
    mainContactPhone: safeTrim(input.mainContactPhone),
    auditTrail: [
      ...(store[index].auditTrail ?? []),
      {
        id: `audit-${Date.now()}`,
        timestamp,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "Contract record edited",
        detail: "Legal updated locked contract record fields.",
      },
    ],
    updatedAt: timestamp,
  });

  store[index] = updated;
  return updated;
}

export function setContractConfidentiality(
  contractId: string,
  confidential: boolean,
  actor: { email: string; name: string },
): ContractRecord {
  const store = getStore();
  const index = store.findIndex((contract) => contract.id === contractId);

  if (index === -1) {
    throw new Error("Contract not found.");
  }

  const timestamp = new Date().toISOString();
  const updated = normalizeContractRecord({
    ...store[index],
    confidential,
    auditTrail: [
      ...(store[index].auditTrail ?? []),
      {
        id: `audit-${Date.now()}`,
        timestamp,
        actorName: actor.name,
        actorEmail: actor.email,
        action: confidential
          ? "Marked confidential"
          : "Removed confidential status",
        detail: confidential
          ? "Legal restricted this contract record to requester, support, legal, and admin users."
          : "Legal removed confidential access restrictions from this contract record.",
      },
    ],
    updatedAt: timestamp,
  });

  store[index] = updated;
  return updated;
}

export function addContractAttachment(
  contractId: string,
  input: ContractIntakeAttachmentInput,
  actor: { email: string; name: string },
): ContractRecord {
  const store = getStore();
  const index = store.findIndex((contract) => contract.id === contractId);

  if (index === -1) {
    throw new Error("Contract not found.");
  }

  const timestamp = new Date().toISOString();
  const attachment: ContractAttachment = {
    id: `att-${Date.now()}`,
    title: input.fileName,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    documentType: input.documentType,
    uploadedAt: timestamp,
    uploadedByName: actor.name,
    uploadedByEmail: actor.email,
    dataBase64: input.dataBase64,
  };
  const updated = normalizeContractRecord({
    ...store[index],
    attachments: [...(store[index].attachments ?? []), attachment],
    auditTrail: [
      ...(store[index].auditTrail ?? []),
      {
        id: `audit-${Date.now()}`,
        timestamp,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "Document uploaded",
        detail: `${attachment.title} was uploaded to the contract record.`,
      },
    ],
    updatedAt: timestamp,
  });

  store[index] = updated;
  return updated;
}

export function addContractEmail(
  contractId: string,
  input: AppendContractEmailInput,
  actorName: string,
  actorEmail: string,
  auditAction = "Email captured",
): ContractRecord {
  const store = getStore();
  const index = store.findIndex((contract) => contract.id === contractId);

  if (index === -1) {
    throw new Error("Contract not found.");
  }

  const updated = appendRelatedEmailToRecord(
    store[index],
    input,
    actorName,
    actorEmail,
    auditAction,
  );

  store[index] = updated;
  return updated;
}

export { parseContractAmount };
