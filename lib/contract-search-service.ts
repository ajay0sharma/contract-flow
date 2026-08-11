import { canViewAllContractRecords } from "@/lib/access-control";
import { getAllowedOrganizationIds } from "@/lib/clause-library-org";
import { canViewContractRecord } from "@/lib/contract-store";
import {
  withDerivedContractStatus,
} from "@/lib/contract-list-service";
import { mapPrismaContractToRecord } from "@/lib/contract-persistence";
import { dedupeContractRecordsById } from "@/lib/dedupe-contract-records";
import { allowMemoryPersistence, requireDatabaseConfigured } from "@/lib/persistence-mode";
import { getPrismaClient } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ContractRecord, ContractStage } from "@/types/contract";

const LEGACY_ORGANIZATION_IDS = ["seed-org-001"] as const;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export type ContractSearchQuery = {
  q?: string;
  stage?: string;
  contractType?: string;
  companyName?: string;
  page?: number;
  pageSize?: number;
};

export type ContractSearchFacets = {
  stages: string[];
  contractTypes: string[];
  counterparties: string[];
};

export type ContractSearchPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type ContractSearchResult = {
  contracts: ContractRecord[];
  pagination: ContractSearchPagination;
  facets: ContractSearchFacets;
};

function resolveAllOrganizationIds(): string[] {
  return [...new Set([...getAllowedOrganizationIds(), ...LEGACY_ORGANIZATION_IDS])];
}

export function parseContractSearchTerms(query?: string): string[] {
  return (query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function contractSearchHaystack(contract: ContractRecord): string {
  return [
    contract.recordNumber,
    contract.title,
    contract.description,
    contract.contractType,
    contract.department,
    contract.companyName,
    contract.requesterName,
    contract.requesterEmail,
    contract.amount,
    contract.poNumber,
    contract.supplierId,
    contract.supplierName,
    contract.mainContactName,
    contract.mainContactEmail,
    contract.mainContactPhone,
    contract.parentAgreementRecordNumber,
    contract.parentAgreementTitle,
    contract.stage,
    contract.confidential ? "confidential" : "",
    ...contract.workflowSteps.flatMap((step) => [
      step.name,
      step.role,
      step.assigneeName,
      step.assigneeEmail,
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesContractSearchTerms(
  contract: ContractRecord,
  terms: string[],
): boolean {
  if (terms.length === 0) {
    return true;
  }

  const haystack = contractSearchHaystack(contract);
  return terms.every((term) => haystack.includes(term));
}

function buildVisibilityWhere(viewerEmail: string): Prisma.ContractWhereInput {
  if (canViewAllContractRecords(viewerEmail)) {
    return {};
  }

  return {
    OR: [{ confidential: false }, { requesterEmail: { equals: viewerEmail, mode: "insensitive" } }],
  };
}

function buildKeywordWhere(terms: string[]): Prisma.ContractWhereInput {
  if (terms.length === 0) {
    return {};
  }

  return {
    AND: terms.map((term) => ({
      OR: [
        { recordNumber: { contains: term, mode: "insensitive" } },
        { title: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
        { contractType: { contains: term, mode: "insensitive" } },
        { department: { contains: term, mode: "insensitive" } },
        { companyName: { contains: term, mode: "insensitive" } },
        { requesterName: { contains: term, mode: "insensitive" } },
        { requesterEmail: { contains: term, mode: "insensitive" } },
        { amount: { contains: term, mode: "insensitive" } },
        { poNumber: { contains: term, mode: "insensitive" } },
        { supplierId: { contains: term, mode: "insensitive" } },
        { supplierName: { contains: term, mode: "insensitive" } },
        { mainContactName: { contains: term, mode: "insensitive" } },
        { mainContactEmail: { contains: term, mode: "insensitive" } },
        { mainContactPhone: { contains: term, mode: "insensitive" } },
        { parentAgreementRecordNumber: { contains: term, mode: "insensitive" } },
        { parentAgreementTitle: { contains: term, mode: "insensitive" } },
        ...workflowStepSearchFilters(term),
      ],
    })),
  };
}

function buildSearchWhere(
  viewerEmail: string,
  query: ContractSearchQuery,
): Prisma.ContractWhereInput {
  const terms = parseContractSearchTerms(query.q);
  const filters: Prisma.ContractWhereInput[] = [
    {
      organizationId: {
        in: resolveAllOrganizationIds(),
      },
    },
    buildVisibilityWhere(viewerEmail),
  ];

  if (query.stage) {
    filters.push({ stage: query.stage as ContractStage });
  }

  if (query.contractType) {
    filters.push({ contractType: query.contractType });
  }

  if (query.companyName) {
    filters.push({ companyName: query.companyName });
  }

  const keywordWhere = buildKeywordWhere(terms);

  if (Object.keys(keywordWhere).length > 0) {
    filters.push(keywordWhere);
  }

  return { AND: filters };
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b),
  );
}

function buildPagination(
  page: number,
  pageSize: number,
  totalCount: number,
): ContractSearchPagination {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const normalizedPage = Math.min(Math.max(page, 1), totalPages);

  return {
    page: normalizedPage,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: normalizedPage < totalPages,
    hasPrevPage: normalizedPage > 1,
  };
}

function workflowStepSearchFilters(term: string): Prisma.ContractWhereInput[] {
  const variants = [
    term,
    term.toLowerCase(),
    term.toUpperCase(),
    term.length > 0
      ? `${term.charAt(0).toUpperCase()}${term.slice(1).toLowerCase()}`
      : term,
  ];

  return [...new Set(variants.filter(Boolean))].map((variant) => ({
    workflowSteps: { string_contains: variant },
  }));
}

function normalizeSearchQuery(query: ContractSearchQuery): Required<
  Pick<ContractSearchQuery, "page" | "pageSize">
> &
  ContractSearchQuery {
  const page = Number.isFinite(query.page) && (query.page ?? 0) > 0 ? query.page! : 1;
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      Number.isFinite(query.pageSize) && (query.pageSize ?? 0) > 0
        ? query.pageSize!
        : DEFAULT_PAGE_SIZE,
    ),
  );

  return {
    ...query,
    page,
    pageSize,
  };
}

async function searchVisibleContractsInDatabase(
  viewerEmail: string,
  query: ContractSearchQuery,
): Promise<ContractSearchResult> {
  requireDatabaseConfigured("contract search");
  const normalizedQuery = normalizeSearchQuery(query);
  const prisma = getPrismaClient();
  const where = buildSearchWhere(viewerEmail, normalizedQuery);
  const facetWhere = buildSearchWhere(viewerEmail, {
    stage: undefined,
    contractType: undefined,
    companyName: undefined,
    q: normalizedQuery.q,
  });

  const totalCount = await prisma.contract.count({ where });
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / normalizedQuery.pageSize),
  );
  const page = Math.min(normalizedQuery.page, totalPages);
  const skip = (page - 1) * normalizedQuery.pageSize;

  const [records, stageRows, typeRows, counterpartyRows] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip,
      take: normalizedQuery.pageSize,
    }),
    prisma.contract.findMany({
      where: facetWhere,
      select: { stage: true },
      distinct: ["stage"],
      orderBy: [{ stage: "asc" }],
    }),
    prisma.contract.findMany({
      where: facetWhere,
      select: { contractType: true },
      distinct: ["contractType"],
      orderBy: [{ contractType: "asc" }],
    }),
    prisma.contract.findMany({
      where: {
        AND: [facetWhere, { companyName: { not: null } }, { NOT: { companyName: "" } }],
      },
      select: { companyName: true },
      distinct: ["companyName"],
      orderBy: [{ companyName: "asc" }],
      take: 250,
    }),
  ]);

  return {
    contracts: dedupeContractRecordsById(
      records.map((record) => withDerivedContractStatus(mapPrismaContractToRecord(record))),
    ),
    pagination: buildPagination(
      page,
      normalizedQuery.pageSize,
      totalCount,
    ),
    facets: {
      stages: uniqueSorted(stageRows.map((row) => row.stage)),
      contractTypes: uniqueSorted(typeRows.map((row) => row.contractType)),
      counterparties: uniqueSorted(counterpartyRows.map((row) => row.companyName)),
    },
  };
}

async function searchVisibleContractsInMemory(
  viewerEmail: string,
  query: ContractSearchQuery,
): Promise<ContractSearchResult> {
  const normalizedQuery = normalizeSearchQuery(query);
  const terms = parseContractSearchTerms(normalizedQuery.q);
  const { getAllContracts } = await import("@/lib/contract-store");
  const organizationIds = new Set(resolveAllOrganizationIds());

  const visible = dedupeContractRecordsById(
    getAllContracts()
      .filter(
        (contract) =>
          organizationIds.has(contract.companyProfileId) &&
          canViewContractRecord(contract, viewerEmail),
      )
      .map(withDerivedContractStatus),
  );

  const facetSource = visible.filter((contract) =>
    matchesContractSearchTerms(contract, terms),
  );

  const filtered = facetSource.filter((contract) => {
    if (normalizedQuery.stage && contract.stage !== normalizedQuery.stage) {
      return false;
    }

    if (
      normalizedQuery.contractType &&
      contract.contractType !== normalizedQuery.contractType
    ) {
      return false;
    }

    if (
      normalizedQuery.companyName &&
      contract.companyName !== normalizedQuery.companyName
    ) {
      return false;
    }

    return true;
  });

  filtered.sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  const totalCount = filtered.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / normalizedQuery.pageSize),
  );
  const page = Math.min(normalizedQuery.page, totalPages);
  const start = (page - 1) * normalizedQuery.pageSize;

  return {
    contracts: filtered.slice(start, start + normalizedQuery.pageSize),
    pagination: buildPagination(
      page,
      normalizedQuery.pageSize,
      totalCount,
    ),
    facets: {
      stages: uniqueSorted(facetSource.map((contract) => contract.stage)),
      contractTypes: uniqueSorted(
        facetSource.map((contract) => contract.contractType),
      ),
      counterparties: uniqueSorted(
        facetSource.map((contract) => contract.companyName),
      ),
    },
  };
}

export async function searchVisibleContractRecords(
  viewerEmail: string,
  query: ContractSearchQuery = {},
): Promise<ContractSearchResult> {
  if (allowMemoryPersistence()) {
    return searchVisibleContractsInMemory(viewerEmail, query);
  }

  return searchVisibleContractsInDatabase(viewerEmail, query);
}

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
