import type { ContractAttachment } from "@/types/contract";

export function findFullyExecutedAgreement(
  attachments: ContractAttachment[],
): ContractAttachment | undefined {
  return attachments
    .filter(
      (attachment) => attachment.documentType === "fully_executed_agreement",
    )
    .sort(
      (left, right) =>
        new Date(right.uploadedAt).getTime() -
        new Date(left.uploadedAt).getTime(),
    )[0];
}

export function hasFullyExecutedAgreement(
  attachments: ContractAttachment[],
): boolean {
  return attachments.some(
    (attachment) => attachment.documentType === "fully_executed_agreement",
  );
}

export function decodeAttachmentText(attachment: ContractAttachment): string {
  if (!attachment.dataBase64) {
    return "";
  }

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
    return Buffer.from(attachment.dataBase64, "base64").toString("utf8");
  } catch {
    return "";
  }
}
