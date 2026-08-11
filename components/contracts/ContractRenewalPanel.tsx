"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDisplayDate } from "@/lib/contract-expiration";
import {
  buildRenewalQueueEntry,
  resolveRenewalSettings,
} from "@/lib/renewal-workflow";
import type { ContractRecord } from "@/types/contract";

interface ContractRenewalPanelProps {
  contract: ContractRecord;
  isPrivilegedUser: boolean;
  onContractUpdated: (contract: ContractRecord) => void;
}

export function ContractRenewalPanel({
  contract,
  isPrivilegedUser,
  onContractUpdated,
}: ContractRenewalPanelProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renewalEntry = useMemo(
    () => buildRenewalQueueEntry(contract),
    [contract],
  );
  const settings = useMemo(() => resolveRenewalSettings(contract), [contract]);

  if (!isPrivilegedUser || contract.stage !== "active") {
    return null;
  }

  async function handleStartRenewal(): Promise<void> {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/${contract.id}/start-renewal`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to start renewal.");
      }

      const data = (await response.json()) as {
        source: ContractRecord;
        renewal: ContractRecord;
      };
      onContractUpdated(data.source);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to start renewal.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handleDecision(
    decision: "non_renewing" | "renewed",
  ): Promise<void> {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${contract.id}/renewal-decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to update renewal decision.");
      }

      const updated = (await response.json()) as ContractRecord;
      onContractUpdated(updated);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update renewal decision.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Renewal workflow</h2>
          <p className="mt-1 text-xs text-gray-600">
            {settings.autoRenewal
              ? `Auto-renewal enabled with ${settings.renewalNoticeDays}-day notice.`
              : `Manual renewal with ${settings.renewalNoticeDays}-day notice period.`}
          </p>
        </div>
        <Link
          href="/renewals"
          className="text-xs font-medium text-indigo-700 hover:text-indigo-800"
        >
          Open renewals queue
        </Link>
      </div>

      {renewalEntry ? (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Expiration
            </dt>
            <dd className="mt-1 text-gray-900">
              {formatDisplayDate(renewalEntry.expirationDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Notice deadline
            </dt>
            <dd className="mt-1 text-gray-900">
              {renewalEntry.actionDeadline
                ? formatDisplayDate(renewalEntry.actionDeadline)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Status
            </dt>
            <dd className="mt-1 capitalize text-gray-900">
              {renewalEntry.displayStatus.replaceAll("_", " ")}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-gray-600">
          This contract is not yet in a renewal notice window.
        </p>
      )}

      {error ? (
        <p className="mt-4 text-sm text-rose-700">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {contract.renewalStatus !== "renewal_in_progress" &&
        contract.renewalStatus !== "renewed" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void handleStartRenewal()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            Start renewal
          </button>
        ) : null}
        {contract.renewalStatus !== "non_renewing" &&
        contract.renewalStatus !== "renewed" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void handleDecision("non_renewing")}
            className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-60"
          >
            Mark non-renewing
          </button>
        ) : null}
      </div>
    </div>
  );
}
