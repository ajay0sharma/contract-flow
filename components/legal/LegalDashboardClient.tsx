"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApprovalReassignDialog } from "@/components/contracts/ApprovalReassignDialog";
import { pickupLegalReviewerAction } from "@/app/actions/contracts";
import { IntakeSettingsClient } from "@/components/legal/IntakeSettingsClient";
import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { StageBadge } from "@/components/contracts/StageBadge";
import { dedupeContractRecordsById } from "@/lib/dedupe-contract-records";
import {
  getLegalOwnerDisplay,
  isAwaitingLegalPickup,
} from "@/lib/legal-assignment";
import { getCurrentApprover, isAwaitingApproval } from "@/lib/workflow-engine";
import type { ContractLifecycleStatus, ContractRecord } from "@/types/contract";

interface LegalDashboardClientProps {
  displayName: string;
  initialTab?: DashboardTab;
  explicitView?: boolean;
}

type DashboardTab = "pending" | "all" | "intake";

type ApprovalAction = "approve" | "reject";

interface ApprovalModalState {
  contractId: string;
  contractTitle: string;
  action: ApprovalAction;
}

interface ReassignModalState {
  contract: ContractRecord;
}

interface LegalContractsCounts {
  draft: number;
  pending: number;
  active: number;
  expired: number;
  rejected: number;
  total: number;
  overdue: number;
}

interface LegalContractsPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface LegalContractsResponse {
  contracts: ContractRecord[];
  pagination: LegalContractsPagination;
  counts: LegalContractsCounts;
}

interface DatabaseFilters {
  contractStatus: string;
  contractType: string;
  search: string;
  page: number;
}

const REFRESH_INTERVAL_MS = 60_000;
const DEFAULT_DATABASE_FILTERS: DatabaseFilters = {
  contractStatus: "",
  contractType: "",
  search: "",
  page: 1,
};

const STATUS_FILTER_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Rejected" },
];

function businessDaysSince(value: string, end: Date = new Date()): number {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  if (Number.isNaN(start.getTime()) || start >= endDay) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start);

  while (cursor < endDay) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();

    if (day !== 0 && day !== 6) {
      count += 1;
    }
  }

  return count;
}

function sortPendingQueue(contracts: ContractRecord[]): ContractRecord[] {
  return [...contracts].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function resolveContractStatus(
  contract: ContractRecord,
): ContractLifecycleStatus {
  if (contract.contractStatus) {
    return contract.contractStatus;
  }

  if (contract.stage === "active") return "active";
  if (contract.stage === "rejected") return "rejected";
  if (contract.stage === "expired") return "expired";
  if (contract.stage === "request") return "draft";

  return "pending";
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" />
      <path d="M4 6v6a8 3 0 0 0 16 0v-6" />
      <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
    </svg>
  );
}

function MetricsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
        >
          <div className="h-4 w-28 rounded bg-slate-100" />
          <div className="mt-3 h-8 w-16 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="h-4 w-48 rounded bg-slate-200" />
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-12 rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function buildLegalContractsUrl(
  view: "all" | "pending",
  options?: {
    contractStatus?: string;
    contractType?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: "createdAt" | "updatedAt" | "amountNumeric" | "stage";
    sortOrder?: "asc" | "desc";
  },
): string {
  const params = new URLSearchParams({ view });

  if (options?.contractStatus) {
    params.set("contractStatus", options.contractStatus);
  }

  if (options?.contractType) {
    params.set("contractType", options.contractType);
  }

  if (options?.search && options.search.trim().length >= 2) {
    params.set("search", options.search.trim());
  }

  if (options?.page) {
    params.set("page", String(options.page));
  }

  if (options?.pageSize) {
    params.set("pageSize", String(options.pageSize));
  }

  if (options?.sortBy) {
    params.set("sortBy", options.sortBy);
  }

  if (options?.sortOrder) {
    params.set("sortOrder", options.sortOrder);
  }

  return `/api/legal/contracts?${params.toString()}`;
}

async function fetchLegalContracts(
  url: string,
): Promise<LegalContractsResponse> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to load contracts");
  }

  return (await response.json()) as LegalContractsResponse;
}

export function LegalDashboardClient({
  displayName,
  initialTab = "pending",
  explicitView = false,
}: LegalDashboardClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [counts, setCounts] = useState<LegalContractsCounts | null>(null);
  const [pendingContracts, setPendingContracts] = useState<ContractRecord[]>(
    [],
  );
  const [databaseContracts, setDatabaseContracts] = useState<ContractRecord[]>(
    [],
  );
  const [databasePagination, setDatabasePagination] =
    useState<LegalContractsPagination | null>(null);
  const [databaseFilters, setDatabaseFilters] = useState<DatabaseFilters>(
    DEFAULT_DATABASE_FILTERS,
  );
  const [contractTypeOptions, setContractTypeOptions] = useState<string[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingDatabase, setLoadingDatabase] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [approvalModal, setApprovalModal] = useState<ApprovalModalState | null>(
    null,
  );
  const [reassignModal, setReassignModal] = useState<ReassignModalState | null>(
    null,
  );
  const [pickupPendingId, setPickupPendingId] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState("");

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (explicitView) {
      return;
    }

    const defaultView =
      initialTab === "all"
        ? "all"
        : initialTab === "intake"
          ? "intake"
          : "pending";
    router.replace(`/legal/dashboard?view=${defaultView}`, { scroll: false });
  }, [explicitView, initialTab, router]);

  function switchTab(tab: DashboardTab): void {
    setActiveTab(tab);
    const nextUrl =
      tab === "all"
        ? "/legal/dashboard?view=all"
        : tab === "intake"
          ? "/legal/dashboard?view=intake"
          : "/legal/dashboard?view=pending";
    router.replace(nextUrl, { scroll: false });
  }

  const pendingReview = useMemo(
    () => sortPendingQueue(pendingContracts),
    [pendingContracts],
  );

  const loadMetrics = useCallback(async () => {
    try {
      const data = await fetchLegalContracts(
        buildLegalContractsUrl("all", { page: 1, pageSize: 1 }),
      );
      setCounts(data.counts);

      if (
        !explicitView &&
        data.counts.total > 0 &&
        data.counts.draft + data.counts.pending === 0
      ) {
        setActiveTab("all");
        router.replace("/legal/dashboard?view=all", { scroll: false });
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load dashboard metrics",
      );
    } finally {
      setLoadingMetrics(false);
    }
  }, [explicitView, router]);

  const loadPending = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoadingPending(true);
    }

    try {
      const data = await fetchLegalContracts(
        buildLegalContractsUrl("pending", {
          pageSize: 100,
          sortBy: "createdAt",
          sortOrder: "desc",
        }),
      );
      setPendingContracts(dedupeContractRecordsById(data.contracts));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load pending review queue",
      );
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const loadDatabase = useCallback(
    async (filters: DatabaseFilters, showLoading = false) => {
      if (showLoading) {
        setLoadingDatabase(true);
      }

      try {
        const data = await fetchLegalContracts(
          buildLegalContractsUrl("all", {
            contractStatus: filters.contractStatus || undefined,
            contractType: filters.contractType || undefined,
            search: filters.search || undefined,
            page: filters.page,
            pageSize: 50,
            sortBy: "createdAt",
            sortOrder: "desc",
          }),
        );
        setDatabaseContracts(dedupeContractRecordsById(data.contracts));
        setDatabasePagination(data.pagination);
        setCounts(data.counts);

        setContractTypeOptions((current) => {
          const types = new Set(current);
          for (const contract of data.contracts) {
            if (contract.contractType.trim()) {
              types.add(contract.contractType);
            }
          }
          return [...types].sort((a, b) => a.localeCompare(b));
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load contract database",
        );
      } finally {
        setLoadingDatabase(false);
      }
    },
    [],
  );

  const refreshDashboard = useCallback(
    async (filters: DatabaseFilters) => {
      setError(null);
      await Promise.all([
        loadMetrics(),
        loadPending(false),
        loadDatabase(filters, false),
      ]);
    },
    [loadDatabase, loadMetrics, loadPending],
  );

  useEffect(() => {
    void loadMetrics();
    void loadPending(true);
  }, [loadMetrics, loadPending]);

  useEffect(() => {
    if (activeTab !== "all") {
      return;
    }

    void loadDatabase(databaseFilters, true);
  }, [activeTab, databaseFilters, loadDatabase]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadMetrics();
      void loadPending(false);

      if (activeTab === "all") {
        void loadDatabase(databaseFilters, false);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTab, databaseFilters, loadDatabase, loadMetrics, loadPending]);

  function openReassignModal(contract: ContractRecord): void {
    setReassignModal({ contract });
  }

  function closeReassignModal(): void {
    setReassignModal(null);
  }

  async function handleReassigned(updated: ContractRecord): Promise<void> {
    setPendingContracts((current) =>
      dedupeContractRecordsById(
        current.map((contract) =>
          contract.id === updated.id ? updated : contract,
        ),
      ),
    );
    await refreshDashboard(databaseFilters);
  }

  async function handlePickup(contractId: string): Promise<void> {
    setPickupPendingId(contractId);
    setError(null);

    try {
      await pickupLegalReviewerAction(contractId);
      await refreshDashboard(databaseFilters);
    } catch (pickupError) {
      setError(
        pickupError instanceof Error
          ? pickupError.message
          : "Failed to pick up contract.",
      );
    } finally {
      setPickupPendingId(null);
    }
  }

  function openApprovalModal(
    contract: ContractRecord,
    action: ApprovalAction,
  ): void {
    setApprovalNote("");
    setApprovalModal({
      contractId: contract.id,
      contractTitle: contract.title,
      action,
    });
  }

  function closeApprovalModal(): void {
    setApprovalModal(null);
    setApprovalNote("");
  }

  async function submitApprovalAction(): Promise<void> {
    if (!approvalModal) {
      return;
    }

    setActionPendingId(approvalModal.contractId);
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${approvalModal.contractId}/${approvalModal.action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: approvalNote.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          data?.error ?? `Failed to ${approvalModal.action} contract`,
        );
      }

      closeApprovalModal();
      await refreshDashboard(databaseFilters);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : `Failed to ${approvalModal.action} contract`,
      );
    } finally {
      setActionPendingId(null);
    }
  }

  function updateDatabaseFilters(
    patch: Partial<DatabaseFilters>,
  ): void {
    setDatabaseFilters((current) => ({
      ...current,
      ...patch,
      page: patch.page ?? 1,
    }));
  }

  function clearDatabaseFilters(): void {
    setDatabaseFilters(DEFAULT_DATABASE_FILTERS);
  }

  const pendingReviewCount =
    counts == null ? 0 : counts.draft + counts.pending;

  return (
    <div className="w-full min-w-0">
      <p className="text-sm text-gray-500">
        Data refreshes every 60 seconds.
      </p>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-100 bg-white px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mt-8">
        {loadingMetrics ? (
          <MetricsSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4 shadow-sm">
              <p className="text-sm font-medium text-indigo-900">Total contracts</p>
              <p className="mt-1 text-2xl font-semibold text-indigo-950">
                {counts?.total ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 shadow-sm">
              <p className="text-sm font-medium text-amber-900">
                Pending review
              </p>
              <p className="mt-1 text-2xl font-semibold text-amber-950">
                {pendingReviewCount}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm">
              <p className="text-sm font-medium text-emerald-900">Active</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-950">
                {counts?.active ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
              <p className="text-sm font-medium text-slate-700">Expired</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {counts?.expired ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 shadow-sm">
              <p className="text-sm font-medium text-rose-900">Rejected</p>
              <p className="mt-1 text-2xl font-semibold text-rose-950">
                {counts?.rejected ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-4 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-medium text-rose-900">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
                </span>
                Overdue
              </p>
              <p className="mt-1 text-2xl font-semibold text-rose-950">
                {counts?.overdue ?? 0}
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="mb-6 w-full border-b border-gray-200">
        <nav className="flex">
          <button
            type="button"
            onClick={() => switchTab("pending")}
            className={`px-5 py-3 text-sm transition-colors ${
              activeTab === "pending"
                ? "border-b-2 border-[#3558A0] font-medium text-[#3558A0]"
                : "border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Pending review
          </button>
          <button
            type="button"
            onClick={() => switchTab("all")}
            className={`flex items-center gap-2 px-5 py-3 text-sm transition-colors ${
              activeTab === "all"
                ? "border-b-2 border-[#3558A0] font-medium text-[#3558A0]"
                : "border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <DatabaseIcon className="h-4 w-4" />
            Contract database
          </button>
          <button
            type="button"
            onClick={() => switchTab("intake")}
            className={`px-5 py-3 text-sm transition-colors ${
              activeTab === "intake"
                ? "border-b-2 border-[#3558A0] font-medium text-[#3558A0]"
                : "border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Intake settings
          </button>
        </nav>
      </div>

      {activeTab === "intake" ? <IntakeSettingsClient /> : null}

      {activeTab === "pending" ? (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Pending review queue
            </h2>
            <p className="text-sm text-slate-600">
              Newest submissions first. Unassigned records stay in the queue until
              a legal user picks them up.
            </p>
          </div>

          {loadingPending ? (
            <TableSkeleton />
          ) : pendingReview.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
              No contracts are currently pending review.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Record number
                    </th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Submitted
                    </th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Requester
                    </th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Title
                    </th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Legal owner
                    </th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Current stage
                    </th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Days in current stage
                    </th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pendingReview.map((contract) => {
                    const daysInStage = businessDaysSince(contract.updatedAt);
                    const isStale = daysInStage > 5;
                    const currentApprover = getCurrentApprover(contract);
                    const legalOwner = getLegalOwnerDisplay(contract);
                    const awaitingPickup = isAwaitingLegalPickup(contract);
                    const canReassign =
                      isAwaitingApproval(contract) &&
                      currentApprover &&
                      !awaitingPickup;

                    return (
                      <tr key={contract.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-indigo-700">
                          <Link
                            href={`/contracts/${contract.id}`}
                            className="hover:underline"
                          >
                            {contract.recordNumber}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {contract.createdAt.slice(0, 10)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {contract.requesterName}
                        </td>
                        <td className="px-4 py-3 text-slate-900">
                          {contract.title}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {contract.contractType}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {contract.amount || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {legalOwner.unassigned ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                              Unassigned
                            </span>
                          ) : (
                            <div>
                              <p className="font-medium text-slate-900">
                                {legalOwner.label}
                              </p>
                              {currentApprover?.id === "legal" ? (
                                <p className="text-xs text-slate-500">
                                  Legal review
                                </p>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StageBadge stage={contract.stage} />
                        </td>
                        <td
                          className={`px-4 py-3 font-medium ${
                            isStale ? "text-rose-700" : "text-slate-700"
                          }`}
                        >
                          {daysInStage}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/contracts/${contract.id}`}
                              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              View
                            </Link>
                            {awaitingPickup ? (
                              <button
                                type="button"
                                disabled={
                                  pickupPendingId === contract.id ||
                                  actionPendingId === contract.id
                                }
                                onClick={() => void handlePickup(contract.id)}
                                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                              >
                                {pickupPendingId === contract.id
                                  ? "Picking up..."
                                  : "Pick up"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={actionPendingId === contract.id || !canReassign}
                              onClick={() => openReassignModal(contract)}
                              className="rounded-md border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                            >
                              Re-route
                            </button>
                            <button
                              type="button"
                              disabled={
                                actionPendingId === contract.id || awaitingPickup
                              }
                              onClick={() =>
                                openApprovalModal(contract, "approve")
                              }
                              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={
                                actionPendingId === contract.id || awaitingPickup
                              }
                              onClick={() =>
                                openApprovalModal(contract, "reject")
                              }
                              className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="w-full min-w-0 rounded-b-xl rounded-tr-xl border border-slate-300 bg-slate-50 p-6 shadow-sm">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <DatabaseIcon className="h-5 w-5 text-slate-700" />
              <h2 className="text-lg font-semibold text-slate-900">
                Contract database
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Complete record of all contracts across all statuses. Use filters
              to narrow results.
            </p>
          </div>

          <div className="mb-4 flex min-w-0 flex-wrap items-end gap-3">
            <label className="min-w-0 text-sm sm:max-w-40">
              <span className="mb-1 block font-medium text-slate-700">
                Status
              </span>
              <select
                value={databaseFilters.contractStatus}
                onChange={(event) =>
                  updateDatabaseFilters({
                    contractStatus: event.target.value,
                  })
                }
                className="w-full min-w-0 truncate rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 text-sm sm:max-w-40">
              <span className="mb-1 block font-medium text-slate-700">
                Contract type
              </span>
              <select
                value={databaseFilters.contractType}
                onChange={(event) =>
                  updateDatabaseFilters({
                    contractType: event.target.value,
                  })
                }
                className="w-full min-w-0 truncate rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">All types</option>
                {contractTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-48 flex-1 text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Search
              </span>
              <input
                type="search"
                value={databaseFilters.search}
                onChange={(event) =>
                  updateDatabaseFilters({ search: event.target.value })
                }
                placeholder="Title, company, record number..."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
          </div>

          {loadingDatabase ? (
            <TableSkeleton />
          ) : databaseContracts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <h3 className="text-base font-semibold text-slate-900">
                No contracts found
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                No contracts match your current filters. Clear filters to see all
                records.
              </p>
              <button
                type="button"
                onClick={clearDatabaseFilters}
                className="mt-5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-0 table-fixed border-collapse divide-y divide-slate-200 text-sm">
                  <colgroup>
                    <col className="w-28" />
                    <col />
                    <col className="w-36" />
                    <col className="w-28" />
                    <col className="w-24" />
                    <col className="w-32" />
                    <col className="w-28" />
                    <col className="w-24" />
                  </colgroup>
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Record number
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Title
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Requester
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Type
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Stage
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Submitted
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {databaseContracts.map((contract) => {
                      const status = resolveContractStatus(contract);
                      const showStage =
                        status === "draft" || status === "pending";

                      return (
                        <tr
                          key={contract.id}
                          className="transition-colors hover:bg-blue-50/20"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-medium text-indigo-700">
                            <Link
                              href={`/contracts/${contract.id}`}
                              className="hover:underline"
                            >
                              {contract.recordNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className="block max-w-xs truncate text-sm font-medium text-slate-900">
                              {contract.title}
                            </span>
                          </td>
                          <td className="truncate px-4 py-3 text-slate-700">
                            {contract.requesterName}
                          </td>
                          <td className="truncate px-4 py-3 text-slate-700">
                            {contract.contractType}
                          </td>
                          <td className="px-4 py-3">
                            <ContractStatusBadge status={status} />
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {showStage ? (
                              <StageBadge stage={contract.stage} />
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {contract.createdAt.slice(0, 10)}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/contracts/${contract.id}`}
                              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {databasePagination ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                  <p>
                    Showing page {databasePagination.page} of{" "}
                    {databasePagination.totalPages} (
                    {databasePagination.totalCount} total records)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!databasePagination.hasPrevPage}
                      onClick={() =>
                        updateDatabaseFilters({
                          page: Math.max(1, databaseFilters.page - 1),
                        })
                      }
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={!databasePagination.hasNextPage}
                      onClick={() =>
                        updateDatabaseFilters({
                          page: databaseFilters.page + 1,
                        })
                      }
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      )}

      {approvalModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {approvalModal.action === "approve" ? "Approve" : "Reject"}{" "}
              contract
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {approvalModal.contractTitle}
            </p>
            <label className="mt-5 block text-sm">
              <span className="mb-2 block font-medium text-slate-800">
                Note (optional)
              </span>
              <textarea
                value={approvalNote}
                onChange={(event) => setApprovalNote(event.target.value)}
                rows={4}
                placeholder="Add context for the requester or audit trail."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeApprovalModal}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionPendingId === approvalModal.contractId}
                onClick={() => void submitApprovalAction()}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  approvalModal.action === "approve"
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {actionPendingId === approvalModal.contractId
                  ? "Submitting..."
                  : approvalModal.action === "approve"
                    ? "Confirm approval"
                    : "Confirm rejection"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ApprovalReassignDialog
        open={Boolean(reassignModal)}
        contract={reassignModal?.contract ?? null}
        onClose={closeReassignModal}
        onReassigned={(updated) => void handleReassigned(updated)}
      />
    </div>
  );
}
