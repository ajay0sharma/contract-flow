"use client";

import { StageBadge } from "@/components/contracts/StageBadge";
import { resolveContractRecordNumber } from "@/lib/record-id";
import type { ContractRecord } from "@/types/contract";

interface AgreementHierarchyPanelProps {
  currentContract: ContractRecord;
  parentAgreement: ContractRecord | null;
  childAgreements: ContractRecord[];
}

interface AgreementCardProps {
  contract: ContractRecord;
  role: "parent" | "current" | "child";
}

function ContractRecordLink({ contract }: { contract: ContractRecord }) {
  return (
    <a
      href={`/contracts/${contract.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-accent hover:text-accent-hover"
      title={`Open ${resolveContractRecordNumber(contract)} in a new tab`}
    >
      {resolveContractRecordNumber(contract)}
      <span aria-hidden className="text-xs font-normal text-text-muted">
        ↗
      </span>
    </a>
  );
}

function roleLabel(role: AgreementCardProps["role"]): string {
  switch (role) {
    case "parent":
      return "Parent agreement";
    case "current":
      return "This record";
    case "child":
      return "Child agreement";
  }
}

function AgreementCard({ contract, role }: AgreementCardProps) {
  const isCurrent = role === "current";

  return (
    <article
      className={`flex h-full min-w-[260px] flex-col rounded-xl border px-5 py-4 shadow-sm ${
        isCurrent
          ? "border-accent bg-accent/5 shadow-md ring-2 ring-accent/15"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {roleLabel(role)}
        </p>
        <StageBadge stage={contract.stage} />
      </div>

      <div className="mt-3">
        <ContractRecordLink contract={contract} />
      </div>

      <h3 className="mt-3 text-base font-medium leading-6 text-foreground">
        {contract.title}
      </h3>

      <div className="mt-3 space-y-1 text-sm text-text-muted">
        <p>{contract.contractType}</p>
        <p>{contract.companyName}</p>
      </div>
    </article>
  );
}

function TreeConnector({ length = "md" }: { length?: "sm" | "md" | "lg" }) {
  const height =
    length === "sm" ? "h-6" : length === "lg" ? "h-12" : "h-8";

  return (
    <div aria-hidden className={`${height} flex justify-center`}>
      <div className="h-full w-px bg-border" />
    </div>
  );
}

function ChildrenBranch({ childAgreements }: { childAgreements: ContractRecord[] }) {
  return (
    <div className="w-full">
      <TreeConnector length="lg" />

      <div className="relative mx-auto w-full max-w-6xl px-2">
        {childAgreements.length > 1 ? (
          <div
            aria-hidden
            className="absolute left-8 right-8 top-0 hidden h-px bg-border sm:block"
          />
        ) : null}

        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {childAgreements.map((child) => (
            <li key={child.id} className="relative flex flex-col pt-0 sm:pt-8">
              {childAgreements.length > 1 ? (
                <div
                  aria-hidden
                  className="absolute left-1/2 top-0 hidden h-8 w-px -translate-x-1/2 bg-border sm:block"
                />
              ) : null}
              <AgreementCard contract={child} role="child" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AgreementHierarchyPanel({
  currentContract,
  parentAgreement,
  childAgreements,
}: AgreementHierarchyPanelProps) {
  const hasParent = Boolean(parentAgreement);
  const hasChildren = childAgreements.length > 0;

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Agreement hierarchy
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
            Parent and child relationships for this contract. Select a record
            number to open that agreement in a new tab.
          </p>
        </div>
        <p className="shrink-0 rounded-full bg-surface-muted px-3 py-1 text-xs text-text-secondary ring-1 ring-inset ring-border">
          {hasParent ? "1 parent" : "No parent"}
          {" · "}
          {hasChildren
            ? `${childAgreements.length} child${childAgreements.length === 1 ? "" : "ren"}`
            : "No children"}
        </p>
      </div>

      <div className="mt-8 flex w-full flex-col items-stretch">
        {hasParent && parentAgreement ? (
          <div className="mx-auto w-full max-w-xl">
            <AgreementCard contract={parentAgreement} role="parent" />
            <TreeConnector />
          </div>
        ) : (
          <p className="mx-auto mb-2 max-w-xl rounded-lg border border-dashed border-border bg-surface-muted px-4 py-3 text-center text-sm text-text-secondary">
            No parent agreement is linked to this record.
          </p>
        )}

        <div className="mx-auto w-full max-w-2xl">
          <AgreementCard contract={currentContract} role="current" />
        </div>

        {hasChildren ? (
          <ChildrenBranch childAgreements={childAgreements} />
        ) : (
          <p className="mx-auto mt-8 max-w-xl rounded-lg border border-dashed border-border bg-surface-muted px-4 py-3 text-center text-sm text-text-secondary">
            No child agreements are linked to this record.
          </p>
        )}
      </div>
    </section>
  );
}
