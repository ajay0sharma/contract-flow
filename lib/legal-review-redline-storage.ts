import { shouldUseAttachmentObjectStorage } from "@/lib/contract-attachment-storage";
import {
  buildLegalReviewRedlineStoragePath,
  uploadContractAttachment,
} from "@/lib/supabase-storage";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import {
  buildRedlineFileName,
  generateRedlineDocx,
} from "@/lib/legal-review-redline";
import type { StructuredDocument } from "@/lib/legal-review-docx-structure";
import type { LegalReviewRedlineDocument, LegalReviewRound } from "@/types/legal-review";

export async function persistLegalReviewRedlineDocument(options: {
  organizationId: string;
  contractId: string;
  roundId: string;
  roundNumber: number;
  baselineFileName: string;
  counterpartyFileName: string;
  baselineText: string;
  counterpartyText: string;
  comparisonSummary: string;
  generatedByName: string;
  baselineStructure?: StructuredDocument | null;
  counterpartyStructure?: StructuredDocument | null;
  documentAlignment?: LegalReviewRound["documentAlignment"];
}): Promise<LegalReviewRedlineDocument> {
  const buffer = await generateRedlineDocx({
    roundNumber: options.roundNumber,
    baselineFileName: options.baselineFileName,
    counterpartyFileName: options.counterpartyFileName,
    baselineText: options.baselineText,
    counterpartyText: options.counterpartyText,
    comparisonSummary: options.comparisonSummary,
    generatedByName: options.generatedByName,
    baselineStructure: options.baselineStructure,
    counterpartyStructure: options.counterpartyStructure,
    documentAlignment: options.documentAlignment ?? undefined,
  });
  const fileName = buildRedlineFileName(options.roundNumber);
  const generatedAt = new Date().toISOString();
  const mimeType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (allowMemoryPersistence() || !shouldUseAttachmentObjectStorage()) {
    return {
      fileName,
      mimeType,
      sizeBytes: buffer.length,
      dataBase64: buffer.toString("base64"),
      generatedAt,
    };
  }

  const storagePath = buildLegalReviewRedlineStoragePath(
    options.organizationId,
    options.contractId,
    options.roundId,
    fileName,
  );

  await uploadContractAttachment(storagePath, buffer, mimeType);

  return {
    fileName,
    mimeType,
    sizeBytes: buffer.length,
    storagePath,
    generatedAt,
  };
}

export function sanitizeRedlineDocumentForClient(
  document: LegalReviewRedlineDocument,
): LegalReviewRedlineDocument {
  const { dataBase64: _dataBase64, ...rest } = document;
  return rest;
}

export function sanitizeLegalReviewRoundForClient(
  round: LegalReviewRound,
): LegalReviewRound {
  if (!round.redlineDocument) {
    return round;
  }

  return {
    ...round,
    redlineDocument: sanitizeRedlineDocumentForClient(round.redlineDocument),
  };
}
