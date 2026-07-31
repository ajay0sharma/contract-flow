import { saveContractRecord } from "@/lib/contract-persistence";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { scanCompanyObligations } from "@/lib/obligation-scanner";
import { findFullyExecutedAgreement } from "@/lib/obligation-documents";
import { resolveContractRecordNumber } from "@/lib/record-id";
import type {
  ContractObligationView,
  ObligationReportEntry,
  ScannedObligationItem,
} from "@/types/obligations";
import type { ContractRecord } from "@/types/contract";
import type { ObligationScanStatus, ObligationType } from "@/lib/generated/prisma/enums";

function emptyObligationView(contractId: string): ContractObligationView {
  return {
    contractId,
    scanStatus: "not_scanned",
    scanCompletedAt: null,
    summary: null,
    obligations: [],
    sourceAttachmentName: null,
  };
}

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseStoredObligations(value: unknown): ScannedObligationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const description =
        typeof record.description === "string" ? record.description : "";

      if (!description) {
        return null;
      }

      return {
        description,
        obligationType:
          typeof record.obligationType === "string"
            ? record.obligationType
            : "Other",
        dueDate:
          typeof record.dueDate === "string" ? record.dueDate : null,
        isRecurring: Boolean(record.isRecurring),
        frequency:
          typeof record.frequency === "string" ? record.frequency : null,
      };
    })
    .filter((item): item is ScannedObligationItem => item !== null);
}

export async function getContractObligationView(
  contractId: string,
): Promise<ContractObligationView> {
  if (!isDatabaseConfigured()) {
    return emptyObligationView(contractId);
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        obligationRecords: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!record) {
      return emptyObligationView(contractId);
    }

    const obligations =
      record.obligationRecords.length > 0
        ? record.obligationRecords.map((item) => ({
            description: item.description,
            obligationType: item.obligationType,
            dueDate: toIsoString(item.dueDate),
            isRecurring: item.isRecurring,
            frequency: item.frequency,
          }))
        : parseStoredObligations(record.obligations);

    return {
      contractId,
      scanStatus: record.obligationScanStatus,
      scanCompletedAt: toIsoString(record.obligationScanCompletedAt),
      summary: record.obligationSummary,
      obligations,
      sourceAttachmentName: null,
    };
  } catch (error) {
    console.error("Failed to load contract obligation view:", error);
    return emptyObligationView(contractId);
  }
}

export async function getObligationScanStatusMap(
  contractIds: string[],
): Promise<Record<string, ObligationScanStatus>> {
  if (contractIds.length === 0 || !isDatabaseConfigured()) {
    return {};
  }

  try {
    const prisma = getPrismaClient();
    const records = await prisma.contract.findMany({
      where: { id: { in: contractIds } },
      select: {
        id: true,
        obligationScanStatus: true,
      },
    });

    return Object.fromEntries(
      records.map((record) => [record.id, record.obligationScanStatus]),
    );
  } catch (error) {
    console.error("Failed to load obligation scan statuses:", error);
    return {};
  }
}

export async function getObligationReportEntries(
  contracts: ContractRecord[],
): Promise<ObligationReportEntry[]> {
  if (contracts.length === 0 || !isDatabaseConfigured()) {
    return [];
  }

  try {
    const prisma = getPrismaClient();
    const contractIds = contracts.map((contract) => contract.id);
    const contractById = new Map(
      contracts.map((contract) => [contract.id, contract]),
    );

    const records = await prisma.contract.findMany({
      where: { id: { in: contractIds } },
      include: {
        obligationRecords: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const entries: ObligationReportEntry[] = [];

    for (const record of records) {
      const contract = contractById.get(record.id);

      if (!contract) {
        continue;
      }

      const obligations =
        record.obligationRecords.length > 0
          ? record.obligationRecords.map((item) => ({
              obligationType: item.obligationType,
              description: item.description,
              dueDate: toIsoString(item.dueDate),
              isRecurring: item.isRecurring,
              frequency: item.frequency,
              status: item.status,
              counterpartyName: item.counterpartyName,
            }))
          : parseStoredObligations(record.obligations).map((item) => ({
              obligationType: item.obligationType,
              description: item.description,
              dueDate: item.dueDate ?? null,
              isRecurring: item.isRecurring,
              frequency: item.frequency ?? null,
              status: "active",
              counterpartyName: contract.companyName,
            }));

      for (const obligation of obligations) {
        entries.push({
          contractId: contract.id,
          recordNumber: resolveContractRecordNumber(contract),
          contractTitle: contract.title,
          contractType: contract.contractType,
          department: contract.department,
          counterpartyName: obligation.counterpartyName ?? contract.companyName,
          obligationType: obligation.obligationType,
          description: obligation.description,
          dueDate: obligation.dueDate,
          isRecurring: obligation.isRecurring,
          frequency: obligation.frequency,
          status: obligation.status,
          scanStatus: record.obligationScanStatus,
          obligationSummary: record.obligationSummary,
        });
      }
    }

    return entries.sort((left, right) =>
      left.counterpartyName.localeCompare(right.counterpartyName),
    );
  } catch (error) {
    console.error("Failed to load obligation report entries:", error);
    return [];
  }
}

export async function runObligationScan(
  contract: ContractRecord,
  _actor: { email: string; name: string },
): Promise<ContractObligationView> {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "Database is not configured. Set DATABASE_URL in .env.local and restart the server.",
    );
  }

  const attachment = findFullyExecutedAgreement(contract.attachments);

  if (!attachment) {
    throw new Error(
      "Upload a fully executed agreement before running the obligation scan.",
    );
  }

  const prisma = getPrismaClient();

  await saveContractRecord(contract);
  await prisma.contract.update({
    where: { id: contract.id },
    data: {
      obligationScanStatus: "scanning",
      obligationScanCompletedAt: null,
    },
  });

  try {
    const scanResult = await scanCompanyObligations(contract, attachment);

    await prisma.$transaction(async (tx) => {
      await tx.obligation.deleteMany({
        where: { contractId: contract.id },
      });

      await tx.contract.update({
        where: { id: contract.id },
        data: {
          organizationId: contract.companyProfileId,
          obligationScanStatus: "completed",
          obligationScanCompletedAt: new Date(),
          obligations: JSON.parse(
            JSON.stringify(scanResult.obligations),
          ) as Prisma.InputJsonValue,
          obligationSummary: scanResult.summary,
        },
      });

      if (scanResult.obligations.length > 0) {
        await tx.obligation.createMany({
          data: scanResult.obligations.map((item) => ({
            contractId: contract.id,
            organizationId: contract.companyProfileId,
            description: item.description,
            obligationType: item.obligationType as ObligationType,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            isRecurring: item.isRecurring,
            frequency: item.frequency ?? null,
            counterpartyName: contract.companyName,
          })),
        });
      }
    });

    return {
      contractId: contract.id,
      scanStatus: "completed",
      scanCompletedAt: new Date().toISOString(),
      summary: scanResult.summary,
      obligations: scanResult.obligations,
      sourceAttachmentName: attachment.fileName,
    };
  } catch (error) {
    try {
      await prisma.contract.update({
        where: { id: contract.id },
        data: {
          obligationScanStatus: "failed",
        },
      });
    } catch (updateError) {
      console.error("Failed to mark obligation scan as failed:", updateError);
    }

    throw error instanceof Error
      ? error
      : new Error("Obligation scan failed.");
  }
}
