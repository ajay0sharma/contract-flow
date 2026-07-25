"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatContractDate } from "@/lib/format-dates";
import {
  OBLIGATION_TYPE_COLORS,
  OBLIGATION_TYPE_DESCRIPTIONS,
  OBLIGATION_TYPE_LABELS,
  OBLIGATION_TYPE_VALUES,
  RESPONSIBLE_PARTIES,
} from "@/lib/obligation-types";

type ViewMode = "type" | "client" | "contract";
type ObligationStatus = "active" | "completed" | "waived" | "";

interface ObligationRow {
  id: string;
  contractId: string;
  description: string;
  obligationType: string;
  dueDate: string | null;
  isRecurring: boolean;
  frequency: string | null;
  noticePeriodDays: number | null;
  responsibleParty: string | null;
  sourceClause: string | null;
  status: ObligationStatus;
  counterpartyName: string | null;
  contractTitle: string | null;
  recordNumber: string | null;
  contractStage: string | null;
  contractLifecycleStatus: string | null;
}

interface ObligationsResponse {
  obligations: ObligationRow[];
  totalCount: number;
  typeCounts: Record<string, number>;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status !== "active") {
    return false;
  }

  return new Date(dueDate).getTime() < Date.now();
}

function escapeCsv(value: string | number | boolean | null | undefined): string {
  const stringValue = String(value ?? "");

  if (/[",\n\r\t]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const contents = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Done
      </span>
    );
  }

  if (status === "waived") {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        Waived
      </span>
    );
  }

  return (
    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
      Active
    </span>
  );
}

function ObligationActions({
  obligation,
  onUpdate,
}: {
  obligation: ObligationRow;
  onUpdate: (id: string, status: ObligationStatus) => Promise<void>;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => void onUpdate(obligation.id, "completed")}
        className="text-xs font-medium text-blue-700 hover:text-blue-900"
      >
        Mark done
      </button>
      <button
        type="button"
        onClick={() => void onUpdate(obligation.id, "waived")}
        className="text-xs font-medium text-gray-600 hover:text-gray-900"
      >
        Mark waived
      </button>
    </div>
  );
}

function ObligationTable({
  rows,
  showCounterparty,
  showContract,
  onUpdate,
}: {
  rows: ObligationRow[];
  showCounterparty: boolean;
  showContract: boolean;
  onUpdate: (id: string, status: ObligationStatus) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-gray-100">
            {showCounterparty ? (
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                Counterparty
              </th>
            ) : null}
            {showContract ? (
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                Contract
              </th>
            ) : null}
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              Obligation
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              Due date
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              Recurring
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              Responsible party
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              Status
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-blue-50/20">
              {showCounterparty ? (
                <td className="px-4 py-3 text-sm text-gray-700">
                  {row.counterpartyName ?? "—"}
                </td>
              ) : null}
              {showContract ? (
                <td className="px-4 py-3 text-sm text-gray-700">
                  <Link
                    href={`/contracts/${row.contractId}`}
                    className="font-medium text-blue-700 hover:text-blue-900"
                  >
                    <span className="font-mono text-xs text-gray-500">
                      {row.recordNumber}
                    </span>
                    <span className="mt-0.5 block">{row.contractTitle}</span>
                  </Link>
                </td>
              ) : null}
              <td className="px-4 py-3 text-sm text-gray-700">{row.description}</td>
              <td
                className={`px-4 py-3 text-sm ${
                  isOverdue(row.dueDate, row.status)
                    ? "text-red-600"
                    : "text-gray-700"
                }`}
              >
                {row.dueDate ? formatContractDate(row.dueDate) : "—"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {row.isRecurring && row.frequency ? `↻ ${row.frequency}` : "—"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {row.responsibleParty ?? "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-4 py-3">
                <ObligationActions obligation={row} onUpdate={onUpdate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ObligationsReportClient() {
  const [data, setData] = useState<ObligationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [counterparty, setCounterparty] = useState("");
  const [status, setStatus] = useState<ObligationStatus>("");
  const [responsibleParty, setResponsibleParty] = useState("All");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [contractSearch, setContractSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("type");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (selectedTypes.length > 0) {
      params.set("types", selectedTypes.join(","));
    }

    if (counterparty.trim()) {
      params.set("counterparty", counterparty.trim());
    }

    if (status) {
      params.set("status", status);
    }

    if (responsibleParty !== "All") {
      params.set("responsibleParty", responsibleParty);
    }

    if (dueDateFrom) {
      params.set("dueDateFrom", dueDateFrom);
    }

    if (dueDateTo) {
      params.set("dueDateTo", dueDateTo);
    }

    if (recurringOnly) {
      params.set("recurringOnly", "true");
    }

    if (contractSearch.trim()) {
      params.set("contractSearch", contractSearch.trim());
    }

    params.set("groupBy", viewMode);
    return params.toString();
  }, [
    selectedTypes,
    counterparty,
    status,
    responsibleParty,
    dueDateFrom,
    dueDateTo,
    recurringOnly,
    contractSearch,
    viewMode,
  ]);

  const loadObligations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/obligations?${queryString}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load obligations.");
      }

      setData(payload);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load obligations.",
      );
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadObligations();
  }, [loadObligations]);

  const filteredTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const obligation of data?.obligations ?? []) {
      counts[obligation.obligationType] =
        (counts[obligation.obligationType] ?? 0) + 1;
    }
    return counts;
  }, [data?.obligations]);

  const groupedByType = useMemo(() => {
    const groups = new Map<string, ObligationRow[]>();

    for (const row of data?.obligations ?? []) {
      const list = groups.get(row.obligationType) ?? [];
      list.push(row);
      groups.set(row.obligationType, list);
    }

    return Array.from(groups.entries()).sort(([left], [right]) =>
      (OBLIGATION_TYPE_LABELS[left] ?? left).localeCompare(
        OBLIGATION_TYPE_LABELS[right] ?? right,
      ),
    );
  }, [data?.obligations]);

  const groupedByClient = useMemo(() => {
    const groups = new Map<string, ObligationRow[]>();

    for (const row of data?.obligations ?? []) {
      const key = row.counterpartyName ?? "Unknown";
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    return Array.from(groups.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [data?.obligations]);

  const groupedByContract = useMemo(() => {
    const groups = new Map<string, ObligationRow[]>();

    for (const row of data?.obligations ?? []) {
      const list = groups.get(row.contractId) ?? [];
      list.push(row);
      groups.set(row.contractId, list);
    }

    return Array.from(groups.entries());
  }, [data?.obligations]);

  async function updateStatus(id: string, nextStatus: ObligationStatus) {
    try {
      const response = await fetch(`/api/obligations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Update failed.");
      }

      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          obligations: current.obligations.map((item) =>
            item.id === id ? { ...item, status: nextStatus } : item,
          ),
        };
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update obligation.",
      );
    }
  }

  function exportCsv() {
    const rows = data?.obligations ?? [];
    const sorted = [...rows];

    if (viewMode === "client") {
      sorted.sort((left, right) => {
        const clientCompare = (left.counterpartyName ?? "").localeCompare(
          right.counterpartyName ?? "",
        );
        if (clientCompare !== 0) {
          return clientCompare;
        }
        return left.obligationType.localeCompare(right.obligationType);
      });
    } else if (viewMode === "contract") {
      sorted.sort((left, right) => {
        const recordCompare = (left.recordNumber ?? "").localeCompare(
          right.recordNumber ?? "",
        );
        if (recordCompare !== 0) {
          return recordCompare;
        }
        return left.obligationType.localeCompare(right.obligationType);
      });
    } else {
      sorted.sort((left, right) => {
        const typeCompare = left.obligationType.localeCompare(right.obligationType);
        if (typeCompare !== 0) {
          return typeCompare;
        }
        return (left.counterpartyName ?? "").localeCompare(
          right.counterpartyName ?? "",
        );
      });
    }

    const header = [
      "Obligation type",
      "Type description",
      "Counterparty / client",
      "Contract record number",
      "Contract title",
      "Obligation description",
      "Due date",
      "Recurring",
      "Frequency",
      "Notice period (days)",
      "Responsible party",
      "Source clause",
      "Status",
      "Contract stage",
      "Contract status",
    ];

    const body = sorted.map((row) => [
      OBLIGATION_TYPE_LABELS[row.obligationType] ?? row.obligationType,
      OBLIGATION_TYPE_DESCRIPTIONS[row.obligationType] ?? "",
      row.counterpartyName ?? "",
      row.recordNumber ?? "",
      row.contractTitle ?? "",
      row.description,
      row.dueDate ? formatContractDate(row.dueDate) : "",
      row.isRecurring ? "Yes" : "No",
      row.frequency ?? "",
      row.noticePeriodDays != null ? String(row.noticePeriodDays) : "",
      row.responsibleParty ?? "",
      row.sourceClause ?? "",
      row.status,
      row.contractStage ?? "",
      row.contractLifecycleStatus ?? "",
    ]);

    const filename = `obligations-report-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(filename, [header, ...body]);
  }

  function setQuickDateRange(range: "this-month" | "next-30" | "next-90" | "overdue") {
    const today = new Date();

    if (range === "this-month") {
      setDueDateFrom(startOfMonth(today).toISOString().slice(0, 10));
      setDueDateTo(endOfMonth(today).toISOString().slice(0, 10));
      return;
    }

    if (range === "next-30") {
      setDueDateFrom(today.toISOString().slice(0, 10));
      setDueDateTo(addDays(today, 30).toISOString().slice(0, 10));
      return;
    }

    if (range === "next-90") {
      setDueDateFrom(today.toISOString().slice(0, 10));
      setDueDateTo(addDays(today, 90).toISOString().slice(0, 10));
      return;
    }

    setDueDateFrom("");
    setDueDateTo(today.toISOString().slice(0, 10));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Obligations report</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and report on company obligations across all contracts
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => void loadObligations()}
            className="rounded-md bg-[#3558A0] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d4a88]"
          >
            Run report
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-gray-900">
                Obligation type
              </label>
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedTypes([...OBLIGATION_TYPE_VALUES])}
                  className="text-blue-700 hover:text-blue-900"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypes([])}
                  className="text-blue-700 hover:text-blue-900"
                >
                  Clear all
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {OBLIGATION_TYPE_VALUES.map((type) => {
                const selected = selectedTypes.includes(type);
                const count =
                  filteredTypeCounts[type] ?? data?.typeCounts[type] ?? 0;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      setSelectedTypes((current) =>
                        current.includes(type)
                          ? current.filter((item) => item !== type)
                          : [...current, type],
                      )
                    }
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${
                      selected
                        ? "border-[#3558A0] bg-[#3558A0] text-white"
                        : "border-gray-200 bg-white text-gray-600"
                    }`}
                  >
                    {OBLIGATION_TYPE_LABELS[type]} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                Counterparty / Client
              </label>
              <input
                value={counterparty}
                onChange={(event) => setCounterparty(event.target.value)}
                placeholder="Search counterparty..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                Status
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ObligationStatus)
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="waived">Waived</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                Responsible party
              </label>
              <select
                value={responsibleParty}
                onChange={(event) => setResponsibleParty(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="All">All</option>
                {RESPONSIBLE_PARTIES.map((party) => (
                  <option key={party} value={party}>
                    {party}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                Due date range
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={dueDateFrom}
                  onChange={(event) => setDueDateFrom(event.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={dueDateTo}
                  onChange={(event) => setDueDateTo(event.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-blue-700">
                <button type="button" onClick={() => setQuickDateRange("this-month")}>
                  This month
                </button>
                <button type="button" onClick={() => setQuickDateRange("next-30")}>
                  Next 30 days
                </button>
                <button type="button" onClick={() => setQuickDateRange("next-90")}>
                  Next 90 days
                </button>
                <button type="button" onClick={() => setQuickDateRange("overdue")}>
                  Overdue
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={recurringOnly}
                onChange={(event) => setRecurringOnly(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Show recurring obligations only
            </label>
            <div>
              <input
                value={contractSearch}
                onChange={(event) => setContractSearch(event.target.value)}
                placeholder="Search by contract title or record number..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-gray-900">
          {loading ? "Loading..." : `${data?.totalCount ?? 0} obligations found`}
        </p>
        <div className="flex rounded-lg border border-gray-200 p-1 text-sm">
          {(["type", "client", "contract"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-3 py-1.5 capitalize ${
                viewMode === mode
                  ? "bg-[#3558A0] text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {mode === "type" ? "By type" : mode === "client" ? "By client" : "By contract"}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "type" ? (
        <div className="space-y-4">
          {groupedByType.map(([type, rows]) => {
            const contractCount = new Set(rows.map((row) => row.contractId)).size;
            const expanded = expandedGroups[`type:${type}`] ?? true;

            return (
              <div key={type} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [`type:${type}`]: !expanded,
                    }))
                  }
                  className="flex w-full items-center justify-between gap-4 bg-gray-50 px-4 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: OBLIGATION_TYPE_COLORS[type] }}
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {OBLIGATION_TYPE_LABELS[type]}
                      </p>
                      <p className="text-xs text-gray-500">
                        {OBLIGATION_TYPE_DESCRIPTIONS[type]}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    {rows.length} obligations across {contractCount} contracts
                  </p>
                </button>
                {expanded ? (
                  <ObligationTable
                    rows={rows}
                    showCounterparty
                    showContract
                    onUpdate={updateStatus}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {viewMode === "client" ? (
        <div className="space-y-4">
          {groupedByClient.map(([client, rows]) => {
            const contractCount = new Set(rows.map((row) => row.contractId)).size;
            const expanded = expandedGroups[`client:${client}`] ?? true;
            const active = rows.filter((row) => row.status === "active").length;
            const completed = rows.filter((row) => row.status === "completed").length;
            const overdue = rows.filter((row) =>
              isOverdue(row.dueDate, row.status),
            ).length;

            return (
              <div key={client} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [`client:${client}`]: !expanded,
                    }))
                  }
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{client}</p>
                    <p className="text-xs text-gray-400">
                      {rows.length} obligations across {contractCount} contracts
                    </p>
                  </div>
                </button>
                {expanded ? (
                  <>
                    <ObligationTable
                      rows={rows}
                      showCounterparty={false}
                      showContract
                      onUpdate={updateStatus}
                    />
                    <p className="border-t border-gray-100 px-4 py-3 text-xs italic text-gray-500">
                      Active: {active} · Completed: {completed} · Overdue: {overdue}
                    </p>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {viewMode === "contract" ? (
        <div className="space-y-4">
          {groupedByContract.map(([contractId, rows]) => {
            const first = rows[0];
            const expanded = expandedGroups[`contract:${contractId}`] ?? true;

            return (
              <div key={contractId} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [`contract:${contractId}`]: !expanded,
                    }))
                  }
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      <span className="font-mono text-xs text-gray-500">
                        {first.recordNumber}
                      </span>
                      <span className="mt-1 block">{first.contractTitle}</span>
                    </p>
                    <p className="text-sm text-gray-500">{first.counterpartyName}</p>
                    <p className="text-xs text-gray-400">{rows.length} obligations</p>
                  </div>
                  <Link
                    href={`/contracts/${contractId}`}
                    onClick={(event) => event.stopPropagation()}
                    className="text-xs font-medium text-blue-700 hover:text-blue-900"
                  >
                    View contract
                  </Link>
                </button>
                {expanded ? (
                  <ObligationTable
                    rows={rows}
                    showCounterparty
                    showContract={false}
                    onUpdate={updateStatus}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
