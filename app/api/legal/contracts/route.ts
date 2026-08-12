import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  buildContractStatusCounts,
  countAwaitingSignatureContracts,
  countMyPendingReviewContracts,
  countOverduePendingContracts,
  countPendingReviewContracts,
  countUnassignedPendingReviewContracts,
  filterContractRecords,
  listMergedContractRecords,
  sortContractRecords,
} from "@/lib/contract-list-service";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import type { ContractLifecycleStatus } from "@/types/contract";

const VALID_VIEWS = new Set(["all", "pending", "mine", "unassigned", "signature"]);
const VALID_SORT_BY = new Set([
  "createdAt",
  "updatedAt",
  "amountNumeric",
  "stage",
]);
const VALID_SORT_ORDERS = new Set(["asc", "desc"]);
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const OVERDUE_CALENDAR_DAYS = 7;

type LegalContractsView =
  | "all"
  | "pending"
  | "mine"
  | "unassigned"
  | "signature";
type LegalContractsSortBy =
  | "createdAt"
  | "updatedAt"
  | "amountNumeric"
  | "stage";
type LegalContractsSortOrder = "asc" | "desc";

const VALID_CONTRACT_STATUSES = new Set([
  "draft",
  "pending",
  "active",
  "expired",
  "rejected",
]);

type LegalContractsQuery = {
  view: LegalContractsView;
  stage?: string;
  contractStatus?: ContractLifecycleStatus;
  contractType?: string;
  search?: string;
  sortBy: LegalContractsSortBy;
  sortOrder: LegalContractsSortOrder;
  page: number;
  pageSize: number;
};

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max?: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  if (max !== undefined) {
    return Math.min(parsed, max);
  }

  return parsed;
}

function parseQuery(request: NextRequest): LegalContractsQuery {
  const { searchParams } = request.nextUrl;
  const rawView = searchParams.get("view")?.trim() || "all";
  const rawSortBy = searchParams.get("sortBy")?.trim() || "createdAt";
  const rawSortOrder = searchParams.get("sortOrder")?.trim() || "desc";
  const search = searchParams.get("search")?.trim();
  const rawContractStatus = searchParams.get("contractStatus")?.trim() ?? "";

  return {
    view: VALID_VIEWS.has(rawView) ? (rawView as LegalContractsView) : "all",
    stage: searchParams.get("stage")?.trim() || undefined,
    contractStatus: VALID_CONTRACT_STATUSES.has(rawContractStatus)
      ? (rawContractStatus as ContractLifecycleStatus)
      : undefined,
    contractType: searchParams.get("contractType")?.trim() || undefined,
    search: search && search.length >= 2 ? search : undefined,
    sortBy: VALID_SORT_BY.has(rawSortBy)
      ? (rawSortBy as LegalContractsSortBy)
      : "createdAt",
    sortOrder: VALID_SORT_ORDERS.has(rawSortOrder)
      ? (rawSortOrder as LegalContractsSortOrder)
      : "desc",
    page: parsePositiveInt(searchParams.get("page"), 1),
    pageSize: parsePositiveInt(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    ),
  };
}

export async function GET(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isLegalEmail(actorEmail) && !isAdminEmail(actorEmail)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const query = parseQuery(request);
    const overdueCutoff = new Date();
    overdueCutoff.setDate(overdueCutoff.getDate() - OVERDUE_CALENDAR_DAYS);

    const allContracts = await listMergedContractRecords(organizationId);
    const filteredContracts = filterContractRecords(allContracts, {
      view: query.view,
      stage: query.stage,
      contractStatus: query.contractStatus,
      contractType: query.contractType,
      search: query.search,
      legalOwnerEmail:
        query.view === "mine" ? actorEmail : undefined,
    });
    const sortedContracts = sortContractRecords(
      filteredContracts,
      query.sortBy,
      query.sortOrder,
    );
    const totalCount = sortedContracts.length;
    const contracts = sortedContracts.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    );
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const counts = {
      ...buildContractStatusCounts(allContracts),
      overdue: countOverduePendingContracts(allContracts, overdueCutoff),
      pendingReview: countPendingReviewContracts(allContracts),
      myQueue: countMyPendingReviewContracts(allContracts, actorEmail),
      unassignedQueue: countUnassignedPendingReviewContracts(allContracts),
      awaitingSignature: countAwaitingSignatureContracts(allContracts),
    };

    return NextResponse.json({
      contracts,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalCount,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      },
      counts,
    });
  } catch (error) {
    reportError(error, { route: "GET /api/legal/contracts" });
    return NextResponse.json(
      { error: "Failed to load legal contracts." },
      { status: 500 },
    );
  }
}
