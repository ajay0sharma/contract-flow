import {
  getAllowedOrganizationIds,
  resolveClauseLibraryOrganizationId,
} from "@/lib/clause-library-org";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";

export async function resolveContractOrganizationId(
  contractId: string,
): Promise<string | null> {
  const trimmedId = contractId.trim();

  if (!trimmedId) {
    return null;
  }

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      const record = await prisma.contract.findUnique({
        where: { id: trimmedId },
        select: { organizationId: true },
      });

      if (record?.organizationId) {
        return resolveClauseLibraryOrganizationId(record.organizationId);
      }
    } catch {
      // Fall through to merged lookup.
    }
  }

  for (const organizationId of getAllowedOrganizationIds()) {
    const contract = await loadMergedContractRecord(trimmedId, organizationId);

    if (contract) {
      return resolveClauseLibraryOrganizationId(contract.companyProfileId);
    }
  }

  return null;
}

export async function resolveOrganizationIdByRecordNumber(
  recordNumber: string,
): Promise<{ contractId: string; organizationId: string } | null> {
  const normalizedRecordNumber = recordNumber.trim().toUpperCase();

  if (!normalizedRecordNumber) {
    return null;
  }

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      const record = await prisma.contract.findFirst({
        where: {
          recordNumber: {
            equals: normalizedRecordNumber,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          organizationId: true,
        },
      });

      if (record) {
        return {
          contractId: record.id,
          organizationId: resolveClauseLibraryOrganizationId(record.organizationId),
        };
      }
    } catch {
      // Fall through to merged lookup.
    }
  }

  for (const organizationId of getAllowedOrganizationIds()) {
    const contract = await loadMergedContractRecord(
      normalizedRecordNumber,
      organizationId,
    );

    if (contract) {
      return {
        contractId: contract.id,
        organizationId: resolveClauseLibraryOrganizationId(
          contract.companyProfileId,
        ),
      };
    }
  }

  return null;
}

export function resolveRequestedOrganizationId(
  requested?: string | null,
): string {
  return resolveClauseLibraryOrganizationId(requested);
}
