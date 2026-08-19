import {
  extractTextFromDocument,
  validateExtractedText,
} from "@/lib/obligation-document-text";
import { loadAttachmentBuffer } from "@/lib/contract-attachment-storage";
import type { ContractAttachment } from "@/types/contract";
import type { LegalReviewDocumentReadiness } from "@/types/legal-review";

const COMPARABLE_EXTENSIONS = new Set(["pdf", "docx"]);

export function isComparableAttachment(attachment: ContractAttachment): boolean {
  const extension = attachment.fileName.split(".").pop()?.toLowerCase() ?? "";

  return COMPARABLE_EXTENSIONS.has(extension);
}

export async function extractComparableAttachmentText(
  attachment: ContractAttachment,
): Promise<{ text: string; warning: string | null }> {
  if (!isComparableAttachment(attachment)) {
    return {
      text: "",
      warning: `${attachment.fileName} is not a PDF or Word document and cannot be compared automatically.`,
    };
  }

  const buffer = await loadAttachmentBuffer(attachment);

  if (!buffer) {
    return {
      text: "",
      warning: `Unable to load ${attachment.fileName} for text extraction.`,
    };
  }

  try {
    const text = await extractTextFromDocument(buffer, attachment.fileName);
    const validationError = validateExtractedText(text);

    return {
      text: text.trim(),
      warning: validationError,
    };
  } catch (error) {
    return {
      text: "",
      warning:
        error instanceof Error
          ? error.message
          : `Unable to extract text from ${attachment.fileName}.`,
    };
  }
}

export async function buildDocumentReadiness(
  attachment: ContractAttachment,
): Promise<LegalReviewDocumentReadiness> {
  const { text, warning } = await extractComparableAttachmentText(attachment);

  return {
    attachmentId: attachment.id,
    fileName: attachment.fileName,
    readable: Boolean(text) && !warning,
    characterCount: text.length,
    warning,
  };
}
