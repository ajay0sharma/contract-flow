"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { scanContractObligationsAction } from "@/app/actions/obligations";
import type { ContractObligationView } from "@/types/obligations";

interface ObligationScanButtonProps {
  contractId: string;
  canScan: boolean;
  hasExecutableAgreement: boolean;
  scanStatus: ContractObligationView["scanStatus"];
  compact?: boolean;
}

function scanStatusLabel(
  status: ContractObligationView["scanStatus"],
): string {
  switch (status) {
    case "scanning":
      return "Scanning...";
    case "completed":
      return "Rescan obligations";
    case "failed":
      return "Retry scan";
    default:
      return "Scan obligations";
  }
}

export function ObligationScanButton({
  contractId,
  canScan,
  hasExecutableAgreement,
  scanStatus,
  compact = false,
}: ObligationScanButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const disabled =
    !canScan || !hasExecutableAgreement || isPending || scanStatus === "scanning";

  function handleScan() {
    setError(null);

    startTransition(async () => {
      try {
        await scanContractObligationsAction(contractId);
        router.refresh();
      } catch (scanError) {
        setError(
          scanError instanceof Error
            ? scanError.message
            : "Unable to scan obligations.",
        );
      }
    });
  }

  if (!canScan) {
    return null;
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <button
        type="button"
        onClick={handleScan}
        disabled={disabled}
        title={
          hasExecutableAgreement
            ? "Scan the fully executed agreement for company obligations"
            : "Upload a fully executed agreement first"
        }
        className={
          compact
            ? "rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-900 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            : "rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isPending || scanStatus === "scanning"
          ? "Scanning..."
          : scanStatusLabel(scanStatus)}
      </button>
      {!hasExecutableAgreement ? (
        <p
          className={
            compact
              ? "text-xs text-slate-500"
              : "text-sm text-text-muted"
          }
        >
          Upload a fully executed agreement to enable scanning.
        </p>
      ) : null}
      {error ? (
        <p
          className={
            compact
              ? "text-xs text-red-700"
              : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          }
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
