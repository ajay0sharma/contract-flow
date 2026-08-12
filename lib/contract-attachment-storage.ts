import { MAX_INTAKE_ATTACHMENT_BYTES } from "@/lib/intake-documents";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import {
  buildContractAttachmentStoragePath,
  isSupabaseStorageConfigured,
  uploadContractAttachment,
  downloadContractAttachment,
} from "@/lib/supabase-storage";
import type { ContractAttachment, ContractRecord } from "@/types/contract";

export function shouldUseAttachmentObjectStorage(): boolean {
  return !allowMemoryPersistence() && isSupabaseStorageConfigured();
}

export function sanitizeAttachmentForClient(
  attachment: ContractAttachment,
): ContractAttachment {
  const { dataBase64: _dataBase64, ...rest } = attachment;
  return rest;
}

export function sanitizeAttachmentsForClient(
  attachments: ContractAttachment[] | undefined,
): ContractAttachment[] {
  return (attachments ?? []).map(sanitizeAttachmentForClient);
}

export function sanitizeContractRecordForClient(
  record: ContractRecord,
): ContractRecord {
  return {
    ...record,
    attachments: sanitizeAttachmentsForClient(record.attachments),
  };
}

function attachmentNeedsStorageUpload(attachment: ContractAttachment): boolean {
  return Boolean(
    attachment.dataBase64?.trim() &&
      !attachment.storagePath?.trim() &&
      shouldUseAttachmentObjectStorage(),
  );
}

export async function persistAttachmentToObjectStorage(
  attachment: ContractAttachment,
  organizationId: string,
  contractId: string,
): Promise<ContractAttachment> {
  if (!attachmentNeedsStorageUpload(attachment)) {
    if (shouldUseAttachmentObjectStorage() && attachment.storagePath?.trim()) {
      const { dataBase64: _dataBase64, ...rest } = attachment;
      return rest;
    }

    return attachment;
  }

  const buffer = Buffer.from(attachment.dataBase64!, "base64");

  if (buffer.length > MAX_INTAKE_ATTACHMENT_BYTES) {
    throw new Error("Attached documents must be 10 MB or smaller.");
  }

  const storagePath = buildContractAttachmentStoragePath(
    organizationId,
    contractId,
    attachment.id,
    attachment.fileName,
  );

  await uploadContractAttachment(
    storagePath,
    buffer,
    attachment.mimeType || "application/octet-stream",
  );

  const { dataBase64: _dataBase64, ...rest } = attachment;

  return {
    ...rest,
    storagePath,
    sizeBytes: attachment.sizeBytes || buffer.length,
  };
}

export async function persistContractAttachmentsToObjectStorage(
  record: ContractRecord,
  organizationId: string,
): Promise<ContractRecord> {
  if (!shouldUseAttachmentObjectStorage()) {
    return record;
  }

  const attachments = await Promise.all(
    (record.attachments ?? []).map((attachment) =>
      persistAttachmentToObjectStorage(attachment, organizationId, record.id),
    ),
  );

  return {
    ...record,
    attachments,
  };
}

export async function loadAttachmentBuffer(
  attachment: ContractAttachment,
): Promise<Buffer | null> {
  if (attachment.storagePath?.trim() && shouldUseAttachmentObjectStorage()) {
    return downloadContractAttachment(attachment.storagePath);
  }

  if (attachment.dataBase64?.trim()) {
    return Buffer.from(attachment.dataBase64, "base64");
  }

  return null;
}

export async function decodeAttachmentTextFromStorage(
  attachment: ContractAttachment,
): Promise<string> {
  const textMimeTypes = new Set([
    "text/plain",
    "text/html",
    "text/csv",
    "application/json",
  ]);

  if (!textMimeTypes.has(attachment.mimeType)) {
    return "";
  }

  try {
    const buffer = await loadAttachmentBuffer(attachment);

    if (!buffer) {
      return "";
    }

    return buffer.toString("utf8");
  } catch {
    return "";
  }
}
