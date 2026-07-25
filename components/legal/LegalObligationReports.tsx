"use client";

import { useMemo, useState } from "react";
import { formatContractDate } from "@/lib/format-dates";
import type { ObligationReportEntry } from "@/types/obligations";

interface LegalObligationReportsProps {
  entries: ObligationReportEntry[];
}

type ObligationFilters = {
  counterparty: string;
  obligationType: string;
  status: string;
};

const initialFilters: ObligationFilters = {
  counterparty: "",
  obligationType: "",
  status: "",
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function escapeDelimited(value: string | number | boolean): string {
  const stringValue = String(value ?? "");

  if (/[",\n\r\t]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

function downloadTextFile(
  filename: string,
  contents: string,
  mimeType: string,
): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function LegalObligationReports({ entries }: LegalObligationReportsProps) {
  const [filters, setFilters] = useState<ObligationFilters>(initialFilters);

  const options = useMemo(
    () => ({
      counterparties: uniqueSorted(entries.map((entry) => entry.counterpartyName)),
      obligationTypes: uniqueSorted(entries.map((entry) => entry.obligationType)),
      statuses: uniqueSorted(entries.map((entry) => entry.status)),
    }),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (filters.counterparty && entry.counterpartyName !== filters.counterparty) {
        return false;
      }

      if (filters.obligationType && entry.obligationType !== filters.obligationType) {
        return false;
      }

      if (filters.status && entry.status !== filters.status) {
        return false;
      }

      return true;
    });
  }, [entries, filters]);

  const counterpartyCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const entry of filteredEntries) {
      counts.set(
        entry.counterpartyName,
        (counts.get(entry.counterpartyName) ?? 0) + 1,
      );
    }

    return [...counts.entries()]
      .map(([counterparty, count]) => ({ counterparty, count }))
      .sort((left, right) => right.count - left.count);
  }, [filteredEntries]);

  function exportCsv(): void {
    const headers = [
      "Record ID",
      "Contract Title",
      "Contract Type",
      "Department",
      "Counterparty",
      "Obligation Type",
      "Description",
      "Due Date",
      "Recurring",
      "Frequency",
      "Status",
      "Scan Status",
      "Obligation Summary",
    ];

    const lines = [
      headers.map(escapeDelimited).join(","),
      ...filteredEntries.map((entry) =>
        [
          entry.recordNumber,
          entry.contractTitle,
          entry.contractType,
          entry.department,
          entry.counterpartyName,
          entry.obligationType,
          entry.description,
          entry.dueDate ? formatContractDate(entry.dueDate) : "",
          entry.isRecurring,
          entry.frequency ?? "",
          entry.status,
          entry.scanStatus,
          entry.obligationSummary ?? "",
        ]
          .map(escapeDelimited)
          .join(","),
      ),
    ];

    downloadTextFile(
      `company-obligations-${new Date().toISOString().slice(0, 10)}.csv`,
      lines.join("\n"),
      "text/csv;charset=utf-8",
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Company obligations report
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Review AI-identified company obligations across counterparties.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filteredEntries.length === 0}
          className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Counterparty</span>
          <select
            value={filters.counterparty}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                counterparty: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
          >
            <option value="">All counterparties</option>
            {options.counterparties.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Obligation type</span>
          <select
            value={filters.obligationType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                obligationType: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
          >
            <option value="">All types</option>
            {options.obligationTypes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Status</span>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value,
              }))
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
          >
            <option value="">All statuses</option>
            {options.statuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Obligations
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {filteredEntries.length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Counterparties
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {counterpartyCounts.length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Top counterparty
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {counterpartyCounts[0]?.counterparty ?? "—"}
          </p>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No scanned company obligations match these filters yet. Run obligation
          scans on contract records with fully executed agreements.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">
                  Record ID
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">
                  Counterparty
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">
                  Type
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">
                  Obligation
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">
                  Due
                </th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">
                  Recurring
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEntries.map((entry, index) => (
                <tr key={`${entry.contractId}-${entry.description}-${index}`}>
                  <td className="px-3 py-3 font-medium text-slate-900">
                    {entry.recordNumber}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {entry.counterpartyName}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {entry.obligationType}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {entry.description}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {entry.dueDate ? formatContractDate(entry.dueDate) : "—"}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {entry.isRecurring
                      ? entry.frequency ?? "Yes"
                      : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
