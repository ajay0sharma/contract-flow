import { getAllowedOrganizationIds } from "@/lib/clause-library-org";
import {
  matchesContractSearchTerms,
  parseContractSearchTerms,
} from "@/lib/contract-search-service";
import { canViewContractRecord } from "@/lib/contract-store";
import {
  deriveContractStatus,
  mapPrismaContractToRecord,
} from "@/lib/contract-persistence";
import { dedupeContractRecordsById } from "@/lib/dedupe-contract-records";
import { reportError } from "@/lib/error-reporting";
import { allowMemoryPersistence, requireDatabaseConfigured } from "@/lib/persistence-mode";
import { normalizeContractRecordLookup } from "@/lib/record-id";
import { getPrismaClient } from "@/lib/prisma";
import type {
  ContractLifecycleStatus,
  ContractRecord,
  ContractStage,
} from "@/types/contract";

const LEGACY_ORGANIZATION_IDS = ["seed-org-001"] as const;

const IN_PROGRESS_CONTRACT_STAGES: ContractStage[] = [
  "request",
  "legal_review",
  "vp_review",
  "finance_review",
  "executive_signoff",
  "awaiting_signature",
];

export type ContractListFilters = {
  stage?: string;
  contractType?: string;
  requesterEmail?: string;
  search?: string;
  contractStatus?: ContractLifecycleStatus;
  view?: "all" | "pending" | "signature";
};

function resolveOrganizationIds(organizationId: string): string[] {
  return [organizationId, ...LEGACY_ORGANIZATION_IDS];
}

function resolveAllOrganizationIds(): string[] {
  return [...new Set([...getAllowedOrganizationIds(), ...LEGACY_ORGANIZATION_IDS])];
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

function matchesSearch(contract: ContractRecord, search: string): boolean {
  return matchesContractSearchTerms(contract, parseContractSearchTerms(search));
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

      if (contract.stage === "awaiting_signature") {
        return false;
      }
    }

    if (filters.view === "signature") {
      if (contract.stage !== "awaiting_signature") {
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

async function listDatabaseContractRecords(
  organizationIds: string[],
): Promise<ContractRecord[]> {
  requireDatabaseForContracts("contract listing");
  const prisma = getPrismaClient();
  const records = await prisma.contract.findMany({
    where: {
      organizationId: {
        in: organizationIds,
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return records.map(mapPrismaContractToRecord);
}

async function loadDatabaseContractRecord(
  lookup: string,
  organizationIds: string[],
): Promise<ContractRecord | null> {
  requireDatabaseForContracts("contract lookup");
  const trimmedLookup = lookup.trim();
  const normalizedLookup = normalizeContractRecordLookup(trimmedLookup);
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

  return record ? withDerivedContractStatus(mapPrismaContractToRecord(record)) : null;
}

function requireDatabaseForContracts(scope: string): void {
  requireDatabaseConfigured(scope);
}

export async function listMergedContractRecords(
  organizationId: string,
): Promise<ContractRecord[]> {
  const organizationIds = resolveOrganizationIds(organizationId);

  if (allowMemoryPersistence()) {
    const { getAllContracts } = await import("@/lib/contract-store");
    const memoryContracts = getAllContracts().filter((contract) =>
      organizationIds.includes(contract.companyProfileId),
    );
    return dedupeContractRecordsById(
      memoryContracts.map(withDerivedContractStatus),
    );
  }

  try {
    const prismaContracts = await listDatabaseContractRecords(organizationIds);
    return dedupeContractRecordsById(
      prismaContracts.map(withDerivedContractStatus),
    );
  } catch (error) {
    reportError(error, { scope: "listMergedContractRecords.prisma" });
    throw error;
  }
}

export async function listAllVisibleContractRecords(
  email: string,
): Promise<ContractRecord[]> {
  const organizationIds = resolveAllOrganizationIds();
  const merged: ContractRecord[] = [];

  for (const organizationId of organizationIds) {
    const records = await listMergedContractRecords(organizationId);
    merged.push(...records);
  }

  return dedupeContractRecordsById(
    merged
      .filter((contract) => canViewContractRecord(contract, email))
      .map(withDerivedContractStatus),
  );
}

export async function getActiveParentAgreementOptions(
  parentAgreementTypes: string[],
  organizationId: string,
  viewerEmail?: string,
): Promise<ContractRecord[]> {
  const allowedTypes = new Set(parentAgreementTypes);

  if (allowedTypes.size === 0) {
    return [];
  }

  const contracts = viewerEmail
    ? (await listAllVisibleContractRecords(viewerEmail)).filter((contract) =>
        resolveOrganizationIds(organizationId).includes(contract.companyProfileId),
      )
    : await listMergedContractRecords(organizationId);

  return contracts
    .filter(
      (contract) =>
        contract.stage === "active" && allowedTypes.has(contract.contractType),
    )
    .sort((a, b) => {
      const recordCompare = a.recordNumber.localeCompare(b.recordNumber);
      return recordCompare !== 0 ? recordCompare : a.title.localeCompare(b.title);
    });
}

export async function countInProgressContractsUsingTemplate(
  templateId: string,
): Promise<number> {
  if (allowMemoryPersistence()) {
    const { countInProgressContractsUsingTemplate: countInMemory } = await import(
      "@/lib/contract-store"
    );
    return countInMemory(templateId);
  }

  const prisma = getPrismaClient();
  return prisma.contract.count({
    where: {
      templateId,
      stage: {
        in: IN_PROGRESS_CONTRACT_STAGES,
      },
    },
  });
}

export async function loadContractRecordByLookup(
  recordLookup: string,
  organizationId: string,
): Promise<ContractRecord | null> {
  const normalizedLookup = normalizeContractRecordLookup(recordLookup);

  if (!normalizedLookup) {
    return null;
  }

  return loadMergedContractRecord(normalizedLookup, organizationId);
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

export function countAwaitingSignatureContracts(
  contracts: ContractRecord[],
): number {
  return contracts.filter(
    (contract) => contract.stage === "awaiting_signature",
  ).length;
}

export function countPendingReviewContracts(
  contracts: ContractRecord[],
): number {
  return contracts.filter((contract) => {
    const status =
      contract.contractStatus ?? deriveContractStatus(contract.stage);

    return (
      (status === "draft" || status === "pending") &&
      contract.stage !== "awaiting_signature"
    );
  }).length;
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
      contract.stage !== "awaiting_signature" &&
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
  const organizationIds = resolveOrganizationIds(organizationId);

  if (allowMemoryPersistence()) {
    const {
      getContractById,
      getContractByRecordLookup,
    } = await import("@/lib/contract-store");
    const memoryRecord =
      getContractById(trimmedLookup) ??
      getContractByRecordLookup(trimmedLookup);

    if (!memoryRecord) {
      return null;
    }

    if (!organizationIds.includes(memoryRecord.companyProfileId)) {
      return null;
    }

    return withDerivedContractStatus(memoryRecord);
  }

  try {
    return await loadDatabaseContractRecord(trimmedLookup, organizationIds);
  } catch (error) {
    reportError(error, {
      scope: "loadMergedContractRecord.prisma",
      lookup: trimmedLookup,
    });
    throw error;
  }
}
