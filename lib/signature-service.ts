import { randomUUID } from "node:crypto";
import type { Prisma, SignatureEnvelope } from "@/lib/generated/prisma/client";
import type { SignatureEnvelopeStatus } from "@/lib/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit-log";
import { getTemplateFileAtVersion } from "@/lib/contract-template-store";
import { mergeContractTemplateDraftFromRecord } from "@/lib/contract-template-merge";
import {
  loadContractRecord,
  saveContractRecord,
} from "@/lib/contract-persistence";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import {
  getSignatureConfigCredentials,
  getSignatureIntegrationConfig,
} from "@/lib/signature-integration";
import { sendSignatureEnvelopeViaProvider } from "@/lib/signature-providers";
import { resolveSignatureApplicationUrl } from "@/lib/signature-settings";
import {
  createExecutedDocumentSignedUrl,
  createTemplateSignedDownloadUrl,
  downloadExecutedDocument,
  downloadTemplateDocument,
  isSupabaseStorageConfigured,
} from "@/lib/supabase-storage";
import { activateContract } from "@/lib/workflow-engine";
import type { ContractRecord } from "@/types/contract";
import { isValidEmail } from "@/lib/person-display";
import type {
  InitiateSignatureInput,
  SignatureDocumentPayload,
  SignatureEnvelopeView,
  SignatureSigner,
} from "@/types/signature-integration";

const globalEnvelopeStore = globalThis as typeof globalThis & {
  __signatureEnvelopeStore?: Map<string, SignatureEnvelopeView>;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getMemoryEnvelopeStore(): Map<string, SignatureEnvelopeView> {
  if (!globalEnvelopeStore.__signatureEnvelopeStore) {
    globalEnvelopeStore.__signatureEnvelopeStore = new Map();
  }

  return globalEnvelopeStore.__signatureEnvelopeStore;
}

function parseSigners(value: unknown): SignatureSigner[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const signers: SignatureSigner[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const signer = entry as Record<string, unknown>;
    const email = String(signer.email ?? "").trim();
    const name = String(signer.name ?? "").trim();

    if (!email || !name) {
      continue;
    }

    signers.push({
      email,
      name,
      role: String(signer.role ?? "signer"),
      status: (signer.status as SignatureSigner["status"]) ?? "pending",
      signedAt:
        typeof signer.signedAt === "string" ? signer.signedAt : null,
    });
  }

  return signers;
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function mapEnvelopeRow(row: SignatureEnvelope): SignatureEnvelopeView {
  const metadata = parseMetadata(row.metadata);

  return {
    id: row.id,
    organizationId: row.organizationId,
    contractId: row.contractId,
    provider: row.provider,
    externalEnvelopeId: row.externalEnvelopeId,
    status: row.status,
    subject: row.subject,
    signers: parseSigners(row.signers),
    documentName: row.documentName,
    sentAt: row.sentAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    declinedAt: row.declinedAt?.toISOString() ?? null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    lastError: row.lastError,
    sentByEmail: row.sentByEmail,
    sentByName: row.sentByName,
    applicationUrl:
      (typeof metadata?.applicationUrl === "string"
        ? metadata.applicationUrl
        : null) ??
      resolveSignatureApplicationUrl({
        provider: row.provider,
        externalEnvelopeId: row.externalEnvelopeId,
        baseUrl:
          typeof metadata?.baseUrl === "string" ? metadata.baseUrl : null,
        metadata,
      }),
  };
}

export async function getLatestSignatureEnvelopeForContract(
  contractId: string,
): Promise<SignatureEnvelopeView | null> {
  if (allowMemoryPersistence() || !isDatabaseConfigured()) {
    const envelopes = [...getMemoryEnvelopeStore().values()]
      .filter((entry) => entry.contractId === contractId)
      .sort((left, right) =>
        (right.sentAt ?? "").localeCompare(left.sentAt ?? ""),
      );

    return envelopes[0] ?? null;
  }

  const prisma = getPrismaClient();
  const row = await prisma.signatureEnvelope.findFirst({
    where: { contractId },
    orderBy: { createdAt: "desc" },
  });

  return row ? mapEnvelopeRow(row) : null;
}

function buildSignersFromContract(contract: ContractRecord): SignatureSigner[] {
  const signers: SignatureSigner[] = [];

  if (contract.mainContactEmail?.trim()) {
    signers.push({
      email: contract.mainContactEmail.trim(),
      name: contract.mainContactName?.trim() || contract.companyName?.trim() || "Counterparty signer",
      role: "counterparty",
      status: "pending",
    });
  }

  if (contract.requesterEmail?.trim()) {
    signers.push({
      email: contract.requesterEmail.trim(),
      name: contract.requesterName?.trim() || "Requester",
      role: "requester",
      status: "pending",
    });
  }

  return signers;
}

const ACTIVE_SIGNATURE_STATUSES = new Set<SignatureEnvelopeStatus>([
  "draft",
  "sent",
  "delivered",
]);

export function buildSignersFromInitiationInput(
  input: InitiateSignatureInput,
): SignatureSigner[] {
  const internalEmail = input.internalSigner.email.trim();
  const internalName = input.internalSigner.name.trim();
  const counterpartyEmail = input.counterparty.email.trim();
  const counterpartyName = input.counterparty.name.trim();

  if (!internalEmail || !internalName) {
    throw new Error("Internal signer name and email are required.");
  }

  if (!counterpartyEmail || !counterpartyName) {
    throw new Error("Counterparty contact name and email are required.");
  }

  if (!isValidEmail(internalEmail)) {
    throw new Error("Internal signer email is invalid.");
  }

  if (!isValidEmail(counterpartyEmail)) {
    throw new Error("Counterparty contact email is invalid.");
  }

  if (internalEmail.toLowerCase() === counterpartyEmail.toLowerCase()) {
    throw new Error("Internal and counterparty signer emails must be different.");
  }

  return [
    {
      email: internalEmail,
      name: internalName,
      role: "internal",
      status: "pending",
    },
    {
      email: counterpartyEmail,
      name: counterpartyName,
      role: "counterparty",
      status: "pending",
    },
  ];
}

async function resolveContractDocument(
  contract: ContractRecord,
): Promise<SignatureDocumentPayload> {
  if (!contract.templateId || !contract.templateVersion) {
    throw new Error(
      "This contract does not have a generated template document to send for signature.",
    );
  }

  if (!isSupabaseStorageConfigured()) {
    throw new Error("Document storage is not configured.");
  }

  const organizationId = contract.companyProfileId;
  const fileReference = await getTemplateFileAtVersion(
    contract.templateId,
    contract.templateVersion,
    organizationId,
  );

  if (!fileReference) {
    throw new Error("Template document not found for this contract.");
  }

  if (contract.generatedDraftPath) {
    const buffer = await downloadExecutedDocument(contract.generatedDraftPath);
    const downloadUrl = await createExecutedDocumentSignedUrl(
      contract.generatedDraftPath,
      3600,
    );
    const fileName =
      contract.generatedDraftPath.split("/").pop() ?? fileReference.fileName;

    return {
      fileName,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64Content: buffer.toString("base64"),
      downloadUrl,
    };
  }

  const mergeOutcome = await mergeContractTemplateDraftFromRecord(contract);

  if (mergeOutcome) {
    const buffer = await downloadExecutedDocument(mergeOutcome.generatedDraftPath);
    const downloadUrl = await createExecutedDocumentSignedUrl(
      mergeOutcome.generatedDraftPath,
      3600,
    );

    return {
      fileName: mergeOutcome.draftFileName,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64Content: buffer.toString("base64"),
      downloadUrl,
    };
  }

  const buffer = await downloadTemplateDocument(fileReference.storagePath);
  const downloadUrl = await createTemplateSignedDownloadUrl(
    fileReference.storagePath,
    3600,
  );

  return {
    fileName: fileReference.fileName,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    base64Content: buffer.toString("base64"),
    downloadUrl,
  };
}

async function persistEnvelope(
  envelope: SignatureEnvelopeView,
  metadata?: Record<string, unknown> | null,
): Promise<SignatureEnvelopeView> {
  const envelopeMetadata = {
    ...(metadata ?? {}),
    ...(envelope.applicationUrl
      ? { applicationUrl: envelope.applicationUrl }
      : {}),
  };

  if (allowMemoryPersistence() || !isDatabaseConfigured()) {
    getMemoryEnvelopeStore().set(envelope.id, envelope);
    return envelope;
  }

  const prisma = getPrismaClient();
  const row = await prisma.signatureEnvelope.upsert({
    where: { id: envelope.id },
    create: {
      id: envelope.id,
      organizationId: envelope.organizationId,
      contractId: envelope.contractId,
      provider: envelope.provider,
      externalEnvelopeId: envelope.externalEnvelopeId,
      status: envelope.status,
      subject: envelope.subject,
      signers: toJsonValue(envelope.signers),
      documentName: envelope.documentName,
      sentAt: envelope.sentAt ? new Date(envelope.sentAt) : null,
      completedAt: envelope.completedAt ? new Date(envelope.completedAt) : null,
      declinedAt: envelope.declinedAt ? new Date(envelope.declinedAt) : null,
      voidedAt: envelope.voidedAt ? new Date(envelope.voidedAt) : null,
      lastError: envelope.lastError,
      sentByEmail: envelope.sentByEmail,
      sentByName: envelope.sentByName,
      metadata: toJsonValue(envelopeMetadata),
    },
    update: {
      externalEnvelopeId: envelope.externalEnvelopeId,
      status: envelope.status,
      subject: envelope.subject,
      signers: toJsonValue(envelope.signers),
      documentName: envelope.documentName,
      sentAt: envelope.sentAt ? new Date(envelope.sentAt) : null,
      completedAt: envelope.completedAt ? new Date(envelope.completedAt) : null,
      declinedAt: envelope.declinedAt ? new Date(envelope.declinedAt) : null,
      voidedAt: envelope.voidedAt ? new Date(envelope.voidedAt) : null,
      lastError: envelope.lastError,
      sentByEmail: envelope.sentByEmail,
      sentByName: envelope.sentByName,
      metadata: toJsonValue(envelopeMetadata),
    },
  });

  return mapEnvelopeRow(row);
}

export async function sendContractForSignature(options: {
  contractId: string;
  organizationId: string;
  actorEmail: string;
  actorName: string;
  signers?: SignatureSigner[];
}): Promise<SignatureEnvelopeView> {
  const config = await getSignatureIntegrationConfig(options.organizationId);

  if (!config.isEnabled) {
    throw new Error("E-signature integration is not enabled for this client.");
  }

  const contract = await loadContractRecord(
    options.contractId,
    options.organizationId,
  );

  if (!contract) {
    throw new Error("Contract not found.");
  }

  if (contract.stage !== "awaiting_signature") {
    throw new Error("Contract is not awaiting signature.");
  }

  const existingEnvelope = await getLatestSignatureEnvelopeForContract(
    options.contractId,
  );

  if (
    existingEnvelope &&
    ACTIVE_SIGNATURE_STATUSES.has(existingEnvelope.status)
  ) {
    throw new Error("This contract has already been sent for signature.");
  }

  const signers =
    options.signers && options.signers.length > 0
      ? options.signers
      : buildSignersFromContract(contract);

  if (signers.length === 0) {
    throw new Error("No signer email addresses are available on this contract.");
  }

  const document = await resolveContractDocument(contract);
  const credentials = await getSignatureConfigCredentials(options.organizationId);
  const subject = `${contract.recordNumber} — ${contract.title}`;

  const result = await sendSignatureEnvelopeViaProvider(
    {
      provider: config.provider,
      displayName: config.displayName,
      accountId: config.accountId,
      baseUrl: config.baseUrl,
      credentials,
    },
    {
      contractId: contract.id,
      organizationId: options.organizationId,
      subject,
      signers,
      document,
      actorEmail: options.actorEmail,
      actorName: options.actorName,
    },
  );

  const applicationUrl =
    result.applicationUrl ??
    resolveSignatureApplicationUrl({
      provider: config.provider,
      externalEnvelopeId: result.externalEnvelopeId,
      baseUrl: config.baseUrl,
      metadata: result.metadata ?? null,
    });

  const envelope: SignatureEnvelopeView = {
    id: randomUUID(),
    organizationId: options.organizationId,
    contractId: contract.id,
    provider: config.provider,
    externalEnvelopeId: result.externalEnvelopeId,
    status: result.status,
    subject,
    signers: signers.map((signer) => ({ ...signer, status: "sent" })),
    documentName: document.fileName,
    sentAt: new Date().toISOString(),
    completedAt: null,
    declinedAt: null,
    voidedAt: null,
    lastError: null,
    sentByEmail: options.actorEmail,
    sentByName: options.actorName,
    applicationUrl,
  };

  const saved = await persistEnvelope(envelope, {
    ...(result.metadata ?? {}),
    baseUrl: config.baseUrl,
  });

  await writeAuditLog({
    organizationId: options.organizationId,
    entityType: "contract",
    entityId: contract.id,
    action: "signature_envelope_sent",
    actorEmail: options.actorEmail,
    actorName: options.actorName,
    detail: `Sent ${contract.recordNumber} for signature via ${config.displayName}.`,
    metadata: {
      provider: config.provider,
      externalEnvelopeId: saved.externalEnvelopeId,
    },
  });

  return saved;
}

export async function completeSignatureEnvelope(options: {
  organizationId: string;
  contractId?: string;
  externalEnvelopeId?: string;
  status?: SignatureEnvelopeStatus;
  actorEmail?: string;
  actorName?: string;
}): Promise<SignatureEnvelopeView | null> {
  let envelope: SignatureEnvelopeView | null = null;

  if (allowMemoryPersistence() || !isDatabaseConfigured()) {
    envelope =
      [...getMemoryEnvelopeStore().values()].find((entry) => {
        if (options.contractId && entry.contractId === options.contractId) {
          return true;
        }

        return (
          options.externalEnvelopeId &&
          entry.externalEnvelopeId === options.externalEnvelopeId
        );
      }) ?? null;
  } else {
    const prisma = getPrismaClient();
    const row = await prisma.signatureEnvelope.findFirst({
      where: {
        organizationId: options.organizationId,
        ...(options.contractId ? { contractId: options.contractId } : {}),
        ...(options.externalEnvelopeId
          ? { externalEnvelopeId: options.externalEnvelopeId }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    envelope = row ? mapEnvelopeRow(row) : null;
  }

  if (!envelope) {
    return null;
  }

  const nextStatus = options.status ?? "completed";
  const updated: SignatureEnvelopeView = {
    ...envelope,
    status: nextStatus,
    completedAt:
      nextStatus === "completed" ? new Date().toISOString() : envelope.completedAt,
    declinedAt:
      nextStatus === "declined" ? new Date().toISOString() : envelope.declinedAt,
    voidedAt:
      nextStatus === "voided" ? new Date().toISOString() : envelope.voidedAt,
  };

  const saved = await persistEnvelope(updated);
  const config = await getSignatureIntegrationConfig(options.organizationId);

  if (
    nextStatus === "completed" &&
    config.autoActivateOnComplete
  ) {
    const contract = await loadContractRecord(
      saved.contractId,
      options.organizationId,
    );

    if (contract && contract.stage === "awaiting_signature") {
      const activated = activateContract(
        contract,
        options.actorName ?? "E-signature webhook",
        options.actorEmail ?? "signature@contract-flow.app",
      );
      await saveContractRecord(activated);

      await writeAuditLog({
        organizationId: options.organizationId,
        entityType: "contract",
        entityId: contract.id,
        action: "contract_activated",
        actorEmail: options.actorEmail ?? "signature@contract-flow.app",
        actorName: options.actorName ?? "E-signature webhook",
        detail: `Activated ${contract.recordNumber} after e-signature completion.`,
      });
    }
  }

  return saved;
}
