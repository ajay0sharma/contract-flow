"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StageBadge } from "@/components/contracts/StageBadge";
import { getCurrentApprover, resolveContractRecordNumber } from "@/lib/contracts";
import { formatStageLabel } from "@/lib/workflow-engine";
import type { ContractRecord, ContractStage } from "@/types/contract";

interface ContractSearchClientProps {
  contracts: ContractRecord[];
  scopeLabel: string;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function searchableText(contract: ContractRecord): string {
  return [
    resolveContractRecordNumber(contract),
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
    contract.stage,
    contract.confidential ? "confidential" : "",
    formatStageLabel(contract.stage),
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

export function ContractSearchClient({
  contracts,
  scopeLabel,
}: ContractSearchClientProps) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [contractType, setContractType] = useState("");
  const [counterparty, setCounterparty] = useState("");

  const options = useMemo(
    () => ({
      stages: uniqueSorted(contracts.map((contract) => contract.stage)),
      contractTypes: uniqueSorted(
        contracts.map((contract) => contract.contractType),
      ),
      counterparties: uniqueSorted(
        contracts.map((contract) => contract.companyName),
      ),
    }),
    [contracts],
  );

  const results = useMemo(() => {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    return contracts.filter((contract) => {
      if (stage && contract.stage !== stage) {
        return false;
      }

      if (contractType && contract.contractType !== contractType) {
        return false;
      }

      if (counterparty && contract.companyName !== counterparty) {
        return false;
      }

      if (terms.length === 0) {
        return true;
      }

      const haystack = searchableText(contract);
      return terms.every((term) => haystack.includes(term));
    });
  }, [contracts, counterparty, contractType, query, stage]);

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
            {results.length} of {contracts.length} records
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
              onChange={(event) => setStage(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">All stages</option>
              {options.stages.map((value) => (
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
              onChange={(event) => setContractType(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">All types</option>
              {options.contractTypes.map((value) => (
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
              onChange={(event) => setCounterparty(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="">All counterparties</option>
              {options.counterparties.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            setQuery("");
            setStage("");
            setContractType("");
            setCounterparty("");
          }}
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
            Results are limited by your user tier.
          </p>
        </div>

        {results.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-muted px-4 py-8 text-center text-sm text-text-muted">
            No records match this search.
          </p>
        ) : (
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
        )}
      </section>
    </div>
  );
}
