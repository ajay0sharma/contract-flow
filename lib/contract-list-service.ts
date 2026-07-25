import { dedupeContractRecordsById } from "@/lib/dedupe-contract-records";
import { getAllContracts, getContractById, getContractByRecordLookup } from "@/lib/contract-store";
import {
  deriveContractStatus,
  mapPrismaContractToRecord,
} from "@/lib/contract-persistence";
import { reportError } from "@/lib/error-reporting";
import { normalizeContractRecordLookup } from "@/lib/record-id";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import type {
  ContractLifecycleStatus,
  ContractRecord,
  ContractStage,
} from "@/types/contract";

const LEGACY_ORGANIZATION_IDS = ["seed-org-001"] as const;

export type ContractListFilters = {
  stage?: string;
  contractType?: string;
  requesterEmail?: string;
  search?: string;
  contractStatus?: ContractLifecycleStatus;
  view?: "all" | "pending";
};

function resolveOrganizationIds(organizationId: string): string[] {
  return [organizationId, ...LEGACY_ORGANIZATION_IDS];
}

export function withDerivedContractStatus(
  contract: ContractRecord,
): ContractRecord {
  return {
    ...contract,
    contractStatus:
      contract.contractStatus ?? deriveContractStatus(contract.stage),
  };
}

function normalizeRecordNumberKey(value: string): string {
  return value.trim().toLowerCase();
}

function mergeContractRecords(
  primary: ContractRecord[],
  secondary: ContractRecord[],
): ContractRecord[] {
  const byId = new Map<string, ContractRecord>();
  const recordNumbersFromPrimary = new Set<string>();

  for (const contract of primary.map(withDerivedContractStatus)) {
    byId.set(contract.id, contract);
    recordNumbersFromPrimary.add(
      normalizeRecordNumberKey(contract.recordNumber),
    );
  }

  for (const contract of secondary.map(withDerivedContractStatus)) {
    if (byId.has(contract.id)) {
      continue;
    }

    if (
      recordNumbersFromPrimary.has(
        normalizeRecordNumberKey(contract.recordNumber),
      )
    ) {
      continue;
    }

    byId.set(contract.id, contract);
  }

  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function matchesSearch(contract: ContractRecord, search: string): boolean {
  const needle = search.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  return [
    contract.title,
    contract.companyName,
    contract.recordNumber,
    contract.mainContactName,
    contract.mainContactEmail,
    contract.requesterName,
  ].some((value) => value.toLowerCase().includes(needle));
}

export function filterContractRecords(
  contracts: ContractRecord[],
  filters?: ContractListFilters,
): ContractRecord[] {
  if (!filters) {
    return contracts;
  }

  return contracts.filter((contract) => {
    const contractStatus =
      contract.contractStatus ?? deriveContractStatus(contract.stage);

    if (filters.view === "pending") {
      if (contractStatus !== "draft" && contractStatus !== "pending") {
        return false;
      }
    }

    if (
      filters.contractStatus &&
      contractStatus !== filters.contractStatus
    ) {
      return false;
    }

    if (filters.stage && contract.stage !== filters.stage) {
      return false;
    }

    if (
      filters.contractType &&
      contract.contractType !== filters.contractType
    ) {
      return false;
    }

    if (
      filters.requesterEmail &&
      contract.requesterEmail.trim().toLowerCase() !==
        filters.requesterEmail.trim().toLowerCase()
    ) {
      return false;
    }

    if (filters.search && !matchesSearch(contract, filters.search)) {
      return false;
    }

    return true;
  });
}

export async function listMergedContractRecords(
  organizationId: string,
): Promise<ContractRecord[]> {
  const organizationIds = resolveOrganizationIds(organizationId);
  let prismaContracts: ContractRecord[] = [];

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      const records = await prisma.contract.findMany({
        where: {
          organizationId: {
            in: organizationIds,
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      });

      prismaContracts = records.map(mapPrismaContractToRecord);
    } catch (error) {
      reportError(error, { scope: "listMergedContractRecords.prisma" });
    }
  }

  const memoryContracts = getAllContracts().filter((contract) =>
    organizationIds.includes(contract.companyProfileId),
  );

  return dedupeContractRecordsById(
    mergeContractRecords(prismaContracts, memoryContracts),
  );
}

export function buildContractStatusCounts(
  contracts: ContractRecord[],
): {
  draft: number;
  pending: number;
  active: number;
  expired: number;
  rejected: number;
  total: number;
} {
  const counts = {
    draft: 0,
    pending: 0,
    active: 0,
    expired: 0,
    rejected: 0,
    total: contracts.length,
  };

  for (const contract of contracts.map(withDerivedContractStatus)) {
    const status = contract.contractStatus ?? "pending";
    counts[status] += 1;
  }

  return counts;
}

export function countOverduePendingContracts(
  contracts: ContractRecord[],
  overdueCutoff: Date,
): number {
  return contracts.filter((contract) => {
    const status =
      contract.contractStatus ?? deriveContractStatus(contract.stage);

    return (
      status === "pending" &&
      new Date(contract.updatedAt).getTime() < overdueCutoff.getTime()
    );
  }).length;
}

export function sortContractRecords(
  contracts: ContractRecord[],
  sortBy: "createdAt" | "updatedAt" | "amountNumeric" | "stage",
  sortOrder: "asc" | "desc",
): ContractRecord[] {
  const direction = sortOrder === "asc" ? 1 : -1;

  return [...contracts].sort((left, right) => {
    if (sortBy === "amountNumeric") {
      return (left.amountNumeric - right.amountNumeric) * direction;
    }

    if (sortBy === "stage") {
      return left.stage.localeCompare(right.stage) * direction;
    }

    return (
      (new Date(left[sortBy]).getTime() - new Date(right[sortBy]).getTime()) *
      direction
    );
  });
}

export function isPendingContractStage(stage: ContractStage): boolean {
  const status = deriveContractStatus(stage);
  return status === "draft" || status === "pending";
}

export async function loadMergedContractRecord(
  lookup: string,
  organizationId: string,
): Promise<ContractRecord | null> {
  const trimmedLookup = lookup.trim();
  const normalizedLookup = normalizeContractRecordLookup(trimmedLookup);
  const organizationIds = resolveOrganizationIds(organizationId);

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      const record = await prisma.contract.findFirst({
        where: {
          organizationId: {
            in: organizationIds,
          },
          OR: [
            { id: trimmedLookup },
            { id: normalizedLookup },
            {
              recordNumber: {
                equals: trimmedLookup,
                mode: "insensitive",
              },
            },
          ],
        },
      });

      if (record) {
        return withDerivedContractStatus(mapPrismaContractToRecord(record));
      }
    } catch (error) {
      reportError(error, {
        scope: "loadMergedContractRecord.prisma",
        lookup: trimmedLookup,
      });
    }
  }

  const memoryRecord =
    getContractById(trimmedLookup) ??
    getContractById(normalizedLookup) ??
    getContractByRecordLookup(trimmedLookup);

  if (!memoryRecord) {
    return null;
  }

  if (!organizationIds.includes(memoryRecord.companyProfileId)) {
    return null;
  }

  return withDerivedContractStatus(memoryRecord);
}
