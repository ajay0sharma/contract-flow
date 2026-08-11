"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { StageBadge } from "@/components/contracts/StageBadge";
import { getCurrentApprover, resolveContractRecordNumber } from "@/lib/contracts";
import type {
  ContractSearchFacets,
  ContractSearchPagination,
} from "@/lib/contract-search-service";
import type { ContractRecord, ContractStage } from "@/types/contract";
import { formatStageLabel } from "@/lib/workflow-engine";

interface ContractSearchClientProps {
  scopeLabel: string;
}

interface ContractSearchResponse {
  contracts: ContractRecord[];
  pagination: ContractSearchPagination;
  facets: ContractSearchFacets;
}

const SEARCH_DEBOUNCE_MS = 300;

function mergeFacetOption(options: string[], selected: string): string[] {
  if (!selected || options.includes(selected)) {
    return options;
  }

  return [...options, selected].sort((a, b) => a.localeCompare(b));
}

export function ContractSearchClient({ scopeLabel }: ContractSearchClientProps) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [contractType, setContractType] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [page, setPage] = useState(1);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<ContractRecord[]>([]);
  const [pagination, setPagination] = useState<ContractSearchPagination>({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [facets, setFacets] = useState<ContractSearchFacets>({
    stages: [],
    contractTypes: [],
    counterparties: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const stageOptions = useMemo(
    () => mergeFacetOption(facets.stages, stage),
    [facets.stages, stage],
  );
  const contractTypeOptions = useMemo(
    () => mergeFacetOption(facets.contractTypes, contractType),
    [contractType, facets.contractTypes],
  );
  const counterpartyOptions = useMemo(
    () => mergeFacetOption(facets.counterparties, counterparty),
    [counterparty, facets.counterparties],
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    async function loadResults(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();

        if (debouncedQuery.trim()) {
          params.set("q", debouncedQuery.trim());
        }

        if (stage) {
          params.set("stage", stage);
        }

        if (contractType) {
          params.set("contractType", contractType);
        }

        if (counterparty) {
          params.set("companyName", counterparty);
        }

        params.set("page", String(page));

        const response = await fetch(`/api/contracts/search?${params.toString()}`);

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Failed to search contracts.");
        }

        const payload = (await response.json()) as ContractSearchResponse;

        if (requestId !== requestIdRef.current) {
          return;
        }

        setResults(payload.contracts);
        setPagination(payload.pagination);
        setFacets(payload.facets);

        if (payload.pagination.page !== page) {
          setPage(payload.pagination.page);
        }
      } catch (fetchError) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to search contracts.",
        );
        setResults([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }

    void loadResults();
  }, [counterparty, contractType, debouncedQuery, page, stage]);

  function resetSearch(): void {
    setQuery("");
    setDebouncedQuery("");
    setStage("");
    setContractType("");
    setCounterparty("");
    setPage(1);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Search contracts
            </h2>
            <p className="mt-1 text-sm text-text-muted">{scopeLabel}</p>
          </div>
          <p className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary">
            {loading
              ? "Searching..."
              : `${results.length} on this page · ${pagination.totalCount} total`}
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Keyword search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search record ID, title, counterparty, PO, supplier, requester..."
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Stage</span>
            <select
              value={stage}
              onChange={(event) => {
                setStage(event.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">All stages</option>
              {stageOptions.map((value) => (
                <option key={value} value={value}>
                  {formatStageLabel(value as ContractStage)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Contract type</span>
            <select
              value={contractType}
              onChange={(event) => {
                setContractType(event.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">All types</option>
              {contractTypeOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Counterparty</span>
            <select
              value={counterparty}
              onChange={(event) => {
                setCounterparty(event.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">All counterparties</option>
              {counterpartyOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={resetSearch}
          className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
        >
          Reset search
        </button>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Search results
          </h2>
          <p className="text-sm text-text-muted">
            Results are limited by your user tier and loaded from the server as
            you search.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-800">
            {error}
          </p>
        ) : loading ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted px-4 py-8 text-center text-sm text-text-muted">
            Loading search results...
          </p>
        ) : results.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted px-4 py-8 text-center text-sm text-text-muted">
            No records match this search.
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {results.map((contract) => {
                const currentApprover = getCurrentApprover(contract);

                return (
                  <li
                    key={contract.id}
                    className="rounded-lg border border-border bg-surface px-4 py-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <Link
                          href={`/contracts/${contract.id}`}
                          className="font-medium text-foreground hover:text-accent"
                        >
                          {contract.title}
                        </Link>
                        <p className="mt-1 text-sm text-text-muted">
                          {resolveContractRecordNumber(contract)} ·{" "}
                          {contract.companyName} · {contract.amount || "No amount"}
                        </p>
                        <p className="mt-1 text-sm text-text-secondary">
                          {contract.contractType} · {contract.department} ·
                          Expires {contract.contractEndDate}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          Requester: {contract.requesterName}
                          {currentApprover
                            ? ` · Current: ${currentApprover.name} (${currentApprover.assigneeName})`
                            : ""}
                        </p>
                        {(contract.poNumber ||
                          contract.supplierId ||
                          contract.supplierName) && (
                          <p className="mt-1 text-xs text-text-muted">
                            PO: {contract.poNumber || "—"} · Supplier:{" "}
                            {contract.supplierName || "—"}{" "}
                            {contract.supplierId
                              ? `(${contract.supplierId})`
                              : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {contract.confidential ? (
                          <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-900 ring-1 ring-inset ring-rose-200">
                            Confidential
                          </span>
                        ) : null}
                        <StageBadge stage={contract.stage} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {pagination.totalPages > 1 ? (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-text-muted">
                  Page {pagination.page} of {pagination.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!pagination.hasPrevPage}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!pagination.hasNextPage}
                    onClick={() =>
                      setPage((current) =>
                        Math.min(pagination.totalPages, current + 1),
                      )
                    }
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
