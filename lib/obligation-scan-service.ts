import { captureException } from "@/lib/error-reporting";
import {
  downloadExecutedDocument,
} from "@/lib/supabase-storage";
import {
  extractTextFromDocument,
  validateExtractedText,
} from "@/lib/obligation-document-text";
import {
  resolveOurCompanyName,
  scanContractObligationsWithAi,
  type ScannedObligationInput,
} from "@/lib/obligation-ai-scanner";
import { writeAuditLog } from "@/lib/audit-log";
import { getPrismaClient } from "@/lib/prisma";
import type { ObligationType } from "@/lib/generated/prisma/enums";

export interface ObligationScanResult {
  success: true;
  obligationCount: number;
  lowConfidenceSkipped: number;
  obligations: Array<{
    id: string;
    contractId: string;
    organizationId: string;
    description: string;
    obligationType: ObligationType;
    dueDate: string | null;
    isRecurring: boolean;
    frequency: string | null;
    noticePeriodDays: number | null;
    actionDeadline: string | null;
    responsibleParty: string | null;
    status: string;
    counterpartyName: string | null;
    contractTitle: string | null;
    recordNumber: string | null;
    sourceClause: string | null;
    confidenceScore: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  scanVersion: number;
  scannedAt: string;
}

function mapObligationRecord(record: {
  id: string;
  contractId: string;
  organizationId: string;
  description: string;
  obligationType: ObligationType;
  dueDate: Date | null;
  isRecurring: boolean;
  frequency: string | null;
  noticePeriodDays: number | null;
  actionDeadline: Date | null;
  responsibleParty: string | null;
  status: string;
  counterpartyName: string | null;
  contractTitle: string | null;
  recordNumber: string | null;
  sourceClause: string | null;
  confidenceScore: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: record.id,
    contractId: record.contractId,
    organizationId: record.organizationId,
    description: record.description,
    obligationType: record.obligationType,
    dueDate: record.dueDate ? record.dueDate.toISOString() : null,
    isRecurring: record.isRecurring,
    frequency: record.frequency,
    noticePeriodDays: record.noticePeriodDays,
    actionDeadline: record.actionDeadline
      ? record.actionDeadline.toISOString()
      : null,
    responsibleParty: record.responsibleParty,
    status: record.status,
    counterpartyName: record.counterpartyName,
    contractTitle: record.contractTitle,
    recordNumber: record.recordNumber,
    sourceClause: record.sourceClause,
    confidenceScore: record.confidenceScore,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function runObligationScanForContract(input: {
  contractId: string;
  organizationId: string;
  actorEmail: string;
  actorName: string;
}): Promise<ObligationScanResult> {
  const prisma = getPrismaClient();
  const contract = await prisma.contract.findFirst({
    where: {
      id: input.contractId,
      organizationId: input.organizationId,
    },
  });

  if (!contract) {
    throw new Error("Contract not found.");
  }

  if (!contract.executedDocumentPath || !contract.executedDocumentName) {
    throw new Error(
      "No executed document found. Please upload the fully executed agreement before scanning for obligations.",
    );
  }

  await prisma.contract.update({
    where: { id: contract.id },
    data: {
      obligationScanStatus: "scanning",
    },
  });

  try {
    const buffer = await downloadExecutedDocument(contract.executedDocumentPath);
    const contractText = await extractTextFromDocument(
      buffer,
      contract.executedDocumentName,
    );
    const textError = validateExtractedText(contractText);

    if (textError) {
      await prisma.contract.update({
        where: { id: contract.id },
        data: { obligationScanStatus: "failed" },
      });
      throw new Error(textError);
    }

    const ourCompanyName = resolveOurCompanyName(contract.companyProfileId);
    const counterpartyName = contract.companyName?.trim() || "Unknown counterparty";

    let scanned: ScannedObligationInput[];
    try {
      scanned = await scanContractObligationsWithAi({
        contractText,
        ourCompanyName,
        counterpartyName,
        contractTitle: contract.title,
        contractType: contract.contractType,
      });
    } catch (parseError) {
      captureException(parseError, { note: "JSON parse failed", contractId: contract.id });
      await prisma.contract.update({
        where: { id: contract.id },
        data: { obligationScanStatus: "failed" },
      });
      throw new Error(
        "The AI returned an unexpected response. Please try scanning again.",
      );
    }

    const accepted = scanned.filter((item) => item.confidenceScore !== "low");
    const lowConfidenceSkipped = scanned.length - accepted.length;
    const typeCount = new Set(accepted.map((item) => item.obligationType)).size;
    const nextVersion = (contract.obligationScanVersion ?? 0) + 1;
    const scannedAt = new Date();

    const created = await prisma.$transaction(async (tx) => {
      await tx.obligation.deleteMany({
        where: { contractId: contract.id },
      });

      if (accepted.length > 0) {
        await tx.obligation.createMany({
          data: accepted.map((item) => ({
            contractId: contract.id,
            organizationId: input.organizationId,
            description: item.description,
            obligationType: item.obligationType,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            isRecurring: item.isRecurring,
            frequency: item.frequency,
            noticePeriodDays: item.noticePeriodDays,
            responsibleParty: item.responsibleParty,
            sourceClause: item.sourceClause,
            confidenceScore: item.confidenceScore,
            counterpartyName: contract.companyName,
            contractTitle: contract.title,
            recordNumber: contract.recordNumber,
          })),
        });
      }

      await tx.contract.update({
        where: { id: contract.id },
        data: {
          obligationScanStatus: "completed",
          obligationScanCompletedAt: scannedAt,
          obligationScanVersion: nextVersion,
        },
      });

      return tx.obligation.findMany({
        where: { contractId: contract.id },
        orderBy: [{ obligationType: "asc" }, { dueDate: "asc" }],
      });
    });

    await writeAuditLog({
      organizationId: input.organizationId,
      entityType: "contract",
      entityId: contract.id,
      action: "obligation_scan_completed",
      detail: `AI obligation scan completed. ${accepted.length} obligations identified across ${typeCount} obligation types.`,
      actorEmail: input.actorEmail,
      actorName: input.actorName,
      metadata: {
        obligationCount: accepted.length,
        lowConfidenceSkipped,
        scanVersion: nextVersion,
      },
    });

    return {
      success: true,
      obligationCount: accepted.length,
      lowConfidenceSkipped,
      obligations: created.map(mapObligationRecord),
      scanVersion: nextVersion,
      scannedAt: scannedAt.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isHandled =
      message.includes("No executed document") ||
      message.includes("Could not extract text") ||
      message.includes("unexpected response");

    if (!isHandled) {
      await prisma.contract
        .update({
          where: { id: input.contractId },
          data: { obligationScanStatus: "failed" },
        })
        .catch(() => undefined);
    }

    throw error;
  }
}
