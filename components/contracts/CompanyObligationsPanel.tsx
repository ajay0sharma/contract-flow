"use client";

import { formatContractDate, formatContractDateTime } from "@/lib/format-dates";
import { ObligationScanButton } from "@/components/contracts/ObligationScanButton";
import type { ContractObligationView } from "@/types/obligations";

interface CompanyObligationsPanelProps {
  contractId: string;
  canScan: boolean;
  hasExecutableAgreement: boolean;
  obligationView: ContractObligationView;
}

function scanStatusBadge(status: ContractObligationView["scanStatus"]): string {
  switch (status) {
    case "completed":
      return "Scan completed";
    case "scanning":
      return "Scan in progress";
    case "failed":
      return "Scan failed";
    default:
      return "Not scanned";
  }
}

export function CompanyObligationsPanel({
  contractId,
  canScan,
  hasExecutableAgreement,
  obligationView,
}: CompanyObligationsPanelProps) {
  const { scanStatus, scanCompletedAt, summary, obligations } = obligationView;

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Company obligations
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            AI scan of the fully executed agreement to identify obligations owed
            by your company (not the counterparty).
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {scanStatusBadge(scanStatus)}
            {scanCompletedAt
              ? ` · ${formatContractDateTime(scanCompletedAt)}`
              : ""}
          </p>
        </div>

        <ObligationScanButton
          contractId={contractId}
          canScan={canScan}
          hasExecutableAgreement={hasExecutableAgreement}
          scanStatus={scanStatus}
        />
      </div>

      {summary ? (
        <div className="mt-5 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-sm font-medium text-indigo-950">Summary</p>
          <p className="mt-1 text-sm text-indigo-900">{summary}</p>
        </div>
      ) : null}

      {obligations.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {obligations.map((obligation, index) => (
            <li
              key={`${obligation.description}-${index}`}
              className="rounded-md border border-border bg-surface-muted px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-indigo-300 bg-white text-xs font-semibold text-indigo-700"
                >
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {obligation.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-secondary">
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-inset ring-border">
                      {obligation.obligationType}
                    </span>
                    {obligation.dueDate ? (
                      <span>Due {formatContractDate(obligation.dueDate)}</span>
                    ) : null}
                    {obligation.isRecurring ? (
                      <span>
                        Recurring
                        {obligation.frequency
                          ? ` · ${obligation.frequency}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-md border border-dashed border-border px-4 py-6 text-sm text-text-secondary">
          {scanStatus === "failed"
            ? "The last scan failed. Upload or verify the fully executed agreement, then retry."
            : "No company obligations have been identified yet. Run a scan after a fully executed agreement is attached."}
        </p>
      )}
    </div>
  );
}
