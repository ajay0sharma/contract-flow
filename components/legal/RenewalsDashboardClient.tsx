"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDisplayDate } from "@/lib/contract-expiration";
import type { RenewalQueueEntry } from "@/lib/renewal-workflow";
import type { RenewalStatus } from "@/types/contract";

interface RenewalsResponse {
  renewals: RenewalQueueEntry[];
  today: string;
  filters: {
    windowDays?: number;
    status?: RenewalStatus | "all";
    autoRenewal?: "all" | "yes" | "no";
  };
}

function statusBadgeClass(status: RenewalStatus): string {
  switch (status) {
    case "notice_window":
      return "bg-amber-100 text-amber-900";
    case "renewal_in_progress":
      return "bg-blue-100 text-blue-900";
    case "renewed":
      return "bg-emerald-100 text-emerald-900";
    case "non_renewing":
      return "bg-slate-200 text-slate-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatStatusLabel(status: RenewalStatus): string {
  return status.replaceAll("_", " ");
}

function RenewalsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 w-full rounded-lg bg-gray-100" />
      <div className="h-64 rounded-2xl bg-gray-100" />
    </div>
  );
}

export function RenewalsDashboardClient() {
  const [renewals, setRenewals] = useState<RenewalQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState("90");
  const [statusFilter, setStatusFilter] = useState<RenewalStatus | "all">("all");
  const [autoRenewalFilter, setAutoRenewalFilter] = useState<"all" | "yes" | "no">(
    "all",
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("window", windowDays);
    params.set("status", statusFilter);
    params.set("autoRenewal", autoRenewalFilter);
    return params.toString();
  }, [autoRenewalFilter, statusFilter, windowDays]);

  const loadRenewals = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/legal/renewals?${queryString}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load renewal queue.");
      }

      const data = (await response.json()) as RenewalsResponse;
      setRenewals(data.renewals ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load renewal queue.",
      );
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadRenewals();
  }, [loadRenewals]);

  async function handleStartRenewal(contractId: string): Promise<void> {
    setActionPendingId(contractId);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/${contractId}/start-renewal`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to start renewal.");
      }

      await loadRenewals();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to start renewal.",
      );
    } finally {
      setActionPendingId(null);
    }
  }

  async function handleRenewalDecision(
    contractId: string,
    decision: "non_renewing" | "renewed",
  ): Promise<void> {
    setActionPendingId(contractId);
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${contractId}/renewal-decision`,
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

      await loadRenewals();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to update renewal decision.",
      );
    } finally {
      setActionPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Window
            <select
              value={windowDays}
              onChange={(event) => setWindowDays(event.target.value)}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
            >
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
              <option value="90">Next 90 days</option>
              <option value="180">Next 180 days</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Status
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as RenewalStatus | "all")
              }
              className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
            >
              <option value="all">All statuses</option>
              <option value="notice_window">Notice window</option>
              <option value="renewal_in_progress">Renewal in progress</option>
              <option value="non_renewing">Non-renewing</option>
              <option value="renewed">Renewed</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Auto-renewal
            <select
              value={autoRenewalFilter}
              onChange={(event) =>
                setAutoRenewalFilter(event.target.value as "all" | "yes" | "no")
              }
              className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
            >
              <option value="all">All contracts</option>
              <option value="yes">Auto-renewing</option>
              <option value="no">Manual renewal</option>
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <RenewalsSkeleton />
      ) : renewals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-900">No renewals due</p>
          <p className="mt-1 text-sm text-gray-500">
            Active contracts approaching expiration will appear here with notice
            deadlines and renewal actions.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Contract</th>
                  <th className="px-4 py-3">Counterparty</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Notice deadline</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {renewals.map((entry) => {
                  const pending = actionPendingId === entry.id;

                  return (
                    <tr key={entry.id} className="align-top">
                      <td className="px-4 py-4">
                        <Link
                          href={`/contracts/${entry.id}`}
                          className="font-medium text-blue-700 hover:text-blue-800"
                        >
                          {entry.recordNumber}
                        </Link>
                        <p className="mt-1 text-gray-900">{entry.title}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {entry.requesterName}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {entry.companyName || "—"}
                        <p className="mt-1 text-xs text-gray-500">
                          {entry.autoRenewal ? "Auto-renewal" : "Manual renewal"}
                          {entry.renewalNoticeDays
                            ? ` · ${entry.renewalNoticeDays}-day notice`
                            : ""}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {formatDisplayDate(entry.expirationDate)}
                        <p className="mt-1 text-xs text-gray-500">
                          {entry.daysUntilExpiration >= 0
                            ? `${entry.daysUntilExpiration} day(s) left`
                            : `${Math.abs(entry.daysUntilExpiration)} day(s) overdue`}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {entry.actionDeadline
                          ? formatDisplayDate(entry.actionDeadline)
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusBadgeClass(entry.displayStatus)}`}
                        >
                          {formatStatusLabel(entry.displayStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {entry.displayStatus !== "renewal_in_progress" &&
                          entry.displayStatus !== "renewed" ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => void handleStartRenewal(entry.id)}
                              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              Start renewal
                            </button>
                          ) : null}
                          {entry.displayStatus !== "non_renewing" &&
                          entry.displayStatus !== "renewed" ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                void handleRenewalDecision(entry.id, "non_renewing")
                              }
                              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Mark non-renewing
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
