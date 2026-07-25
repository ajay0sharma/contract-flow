import Link from "next/link";
import { StageBadge } from "@/components/contracts/StageBadge";
import { getCurrentApprover, getLifecycleSummary, resolveContractRecordNumber } from "@/lib/contracts";
import type { ContractRecord } from "@/types/contract";

interface ContractListProps {
  contracts: ContractRecord[];
  emptyMessage: string;
  showRequester?: boolean;
  reviewLink?: boolean;
}

export function ContractList({
  contracts,
  emptyMessage,
  showRequester = false,
  reviewLink = false,
}: ContractListProps) {
  if (contracts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface-muted px-4 py-8 text-center text-sm text-text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {contracts.map((contract) => {
        const currentApprover = getCurrentApprover(contract);

        return (
          <li
            key={contract.id}
            className="rounded-lg border border-border bg-surface px-4 py-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Link
                  href={`/contracts/${contract.id}`}
                  className="font-medium text-foreground hover:text-accent"
                >
                  {contract.title}
                </Link>
                <p className="mt-1 text-sm text-text-muted">
                  {resolveContractRecordNumber(contract)} · {contract.companyName}{" "}
                  · {contract.amount}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {getLifecycleSummary(contract)}
                </p>
                {showRequester ? (
                  <p className="mt-1 text-sm text-text-secondary">
                    Requested by {contract.requesterName}
                  </p>
                ) : null}
                {currentApprover && !showRequester ? (
                  <p className="mt-1 text-xs text-text-muted">
                    Current step: {currentApprover.name} (
                    {currentApprover.assigneeName})
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-text-muted">
                  Updated {contract.updatedAt.slice(0, 10)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {contract.confidential ? (
                  <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-900 ring-1 ring-inset ring-rose-200">
                    Confidential
                  </span>
                ) : null}
                <StageBadge stage={contract.stage} />
                {reviewLink ? (
                  <Link
                    href={`/contracts/${contract.id}/review`}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                  >
                    Review
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
