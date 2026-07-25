"use client";

import { useMemo, useState } from "react";
import { StageBadge } from "@/components/contracts/StageBadge";
import { formatContractDate } from "@/lib/format-dates";
import { resolveContractRecordNumber } from "@/lib/record-id";
import { formatStageLabel } from "@/lib/workflow-engine";
import type { ContractRecord, ContractStage } from "@/types/contract";

interface LegalReportsClientProps {
  contracts: ContractRecord[];
}

type ReportFilters = {
  contractType: string;
  counterparty: string;
  department: string;
  stage: string;
  legalOwner: string;
  minAmount: string;
  maxAmount: string;
  expiresFrom: string;
  expiresTo: string;
};

type ReportRow = {
  recordId: string;
  title: string;
  contractType: string;
  counterparty: string;
  department: string;
  stage: string;
  legalOwner: string;
  amount: string;
  amountNumeric: number;
  expirationDate: string;
  requester: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
};

type ChartDatum = {
  label: string;
  value: number;
};

const initialFilters: ReportFilters = {
  contractType: "",
  counterparty: "",
  department: "",
  stage: "",
  legalOwner: "",
  minAmount: "",
  maxAmount: "",
  expiresFrom: "",
  expiresTo: "",
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function getLegalOwner(contract: ContractRecord): string {
  return (
    contract.workflowSteps.find((step) => step.id === "legal")?.assigneeName ??
    ""
  );
}

function toDateValue(value: string): number {
  return value ? new Date(value).getTime() : Number.NaN;
}

function escapeDelimited(value: string | number): string {
  const stringValue = String(value ?? "");

  if (/[",\n\r\t]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

function buildReportRows(contracts: ContractRecord[]): ReportRow[] {
  return contracts.map((contract) => ({
    recordId: resolveContractRecordNumber(contract),
    title: contract.title,
    contractType: contract.contractType,
    counterparty: contract.companyName,
    department: contract.department,
    stage: formatStageLabel(contract.stage),
    legalOwner: getLegalOwner(contract),
    amount: contract.amount,
    amountNumeric: contract.amountNumeric,
    expirationDate: contract.contractEndDate,
    requester: contract.requesterName,
    poNumber: contract.poNumber,
    supplierId: contract.supplierId,
    supplierName: contract.supplierName,
  }));
}

function getReportHeaders(): Array<{ key: keyof ReportRow; label: string }> {
  return [
    { key: "recordId", label: "Record ID" },
    { key: "title", label: "Contract Title" },
    { key: "contractType", label: "Contract Type" },
    { key: "counterparty", label: "Counterparty" },
    { key: "department", label: "Department" },
    { key: "stage", label: "Stage" },
    { key: "legalOwner", label: "Legal Owner" },
    { key: "amount", label: "Amount" },
    { key: "amountNumeric", label: "Amount Numeric" },
    { key: "expirationDate", label: "Expiration Date" },
    { key: "requester", label: "Requester" },
    { key: "poNumber", label: "PO Number" },
    { key: "supplierId", label: "Supplier ID" },
    { key: "supplierName", label: "Supplier Name" },
  ];
}

function buildDelimitedExport(rows: ReportRow[], delimiter: "," | "\t"): string {
  const headers = getReportHeaders();
  const lines = [
    headers.map((header) => escapeDelimited(header.label)).join(delimiter),
    ...rows.map((row) =>
      headers.map((header) => escapeDelimited(row[header.key])).join(delimiter),
    ),
  ];

  return lines.join("\n");
}

function escapeXml(value: string | number): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildExcelXmlExport(rows: ReportRow[]): string {
  const headers = getReportHeaders();
  const headerCells = headers
    .map(
      (header) =>
        `<Cell><Data ss:Type="String">${escapeXml(header.label)}</Data></Cell>`,
    )
    .join("");
  const bodyRows = rows
    .map((row) => {
      const cells = headers
        .map((header) => {
          const value = row[header.key];
          const type = typeof value === "number" ? "Number" : "String";
          return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
        })
        .join("");

      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Legal Report">
  <Table>
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;
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

function aggregateCount(
  contracts: ContractRecord[],
  getLabel: (contract: ContractRecord) => string,
): ChartDatum[] {
  const counts = new Map<string, number>();

  for (const contract of contracts) {
    const label = getLabel(contract) || "Unspecified";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function aggregateValue(
  contracts: ContractRecord[],
  getLabel: (contract: ContractRecord) => string,
): ChartDatum[] {
  const values = new Map<string, number>();

  for (const contract of contracts) {
    const label = getLabel(contract) || "Unspecified";
    values.set(label, (values.get(label) ?? 0) + contract.amountNumeric);
  }

  return [...values.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

const chartColors = [
  "#4f46e5",
  "#0f766e",
  "#b45309",
  "#be185d",
  "#7c3aed",
  "#2563eb",
  "#16a34a",
  "#dc2626",
];

function DonutChart({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient =
    total > 0
      ? data
          .map((item, index) => {
            const start = cursor;
            const percentage = (item.value / total) * 100;
            cursor += percentage;
            return `${chartColors[index % chartColors.length]} ${start}% ${cursor}%`;
          })
          .join(", ")
      : "#e2e8f0 0% 100%";

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
      <div
        className="mx-auto h-48 w-48 rounded-full"
        style={{ background: `conic-gradient(${gradient})` }}
        aria-label="Pie chart"
      >
        <div className="flex h-full w-full items-center justify-center rounded-full p-8">
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
            <span className="text-2xl font-semibold text-slate-900">{total}</span>
            <span className="text-xs text-slate-500">records</span>
          </div>
        </div>
      </div>
      <ChartLegend data={data} total={total} />
    </div>
  );
}

function BarChart({
  data,
  valueFormatter = (value) => value.toLocaleString(),
}: {
  data: ChartDatum[];
  valueFormatter?: (value: number) => string;
}) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {data.slice(0, 10).map((item, index) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="text-slate-500">{valueFormatter(item.value)}</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100">
            <div
              className="h-3 rounded-full"
              style={{
                width: `${Math.max((item.value / maxValue) * 100, 3)}%`,
                backgroundColor: chartColors[index % chartColors.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartLegend({ data, total }: { data: ChartDatum[]; total: number }) {
  return (
    <ul className="space-y-2">
      {data.map((item, index) => (
        <li key={item.label} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-slate-700">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: chartColors[index % chartColors.length] }}
            />
            {item.label}
          </span>
          <span className="text-sm font-medium text-slate-900">
            {item.value}{" "}
            <span className="text-xs text-slate-500">
              ({total ? Math.round((item.value / total) * 100) : 0}%)
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LegalReportsClient({ contracts }: LegalReportsClientProps) {
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [visualMode, setVisualMode] = useState<
    "stage" | "type" | "counterpartyValue" | "expiration"
  >("stage");

  const options = useMemo(
    () => ({
      contractTypes: uniqueSorted(contracts.map((contract) => contract.contractType)),
      counterparties: uniqueSorted(contracts.map((contract) => contract.companyName)),
      departments: uniqueSorted(contracts.map((contract) => contract.department)),
      stages: uniqueSorted(contracts.map((contract) => contract.stage)),
      legalOwners: uniqueSorted(contracts.map(getLegalOwner)),
    }),
    [contracts],
  );

  const filteredContracts = useMemo(() => {
    const minAmount = filters.minAmount ? Number(filters.minAmount) : null;
    const maxAmount = filters.maxAmount ? Number(filters.maxAmount) : null;
    const expiresFrom = toDateValue(filters.expiresFrom);
    const expiresTo = toDateValue(filters.expiresTo);

    return contracts.filter((contract) => {
      const expirationDate = toDateValue(contract.contractEndDate);
      const legalOwner = getLegalOwner(contract);

      if (filters.contractType && contract.contractType !== filters.contractType) {
        return false;
      }

      if (filters.counterparty && contract.companyName !== filters.counterparty) {
        return false;
      }

      if (filters.department && contract.department !== filters.department) {
        return false;
      }

      if (filters.stage && contract.stage !== filters.stage) {
        return false;
      }

      if (filters.legalOwner && legalOwner !== filters.legalOwner) {
        return false;
      }

      if (minAmount !== null && contract.amountNumeric < minAmount) {
        return false;
      }

      if (maxAmount !== null && contract.amountNumeric > maxAmount) {
        return false;
      }

      if (!Number.isNaN(expiresFrom) && expirationDate < expiresFrom) {
        return false;
      }

      if (!Number.isNaN(expiresTo) && expirationDate > expiresTo) {
        return false;
      }

      return true;
    });
  }, [contracts, filters]);

  const reportTotals = useMemo(() => {
    const totalValue = filteredContracts.reduce(
      (sum, contract) => sum + contract.amountNumeric,
      0,
    );
    const expiringSoon = filteredContracts.filter((contract) => {
      const expirationDate = toDateValue(contract.contractEndDate);
      const today = new Date();
      const ninetyDaysFromNow = new Date();
      ninetyDaysFromNow.setDate(today.getDate() + 90);
      return expirationDate >= today.getTime() && expirationDate <= ninetyDaysFromNow.getTime();
    }).length;

    return {
      count: filteredContracts.length,
      totalValue,
      expiringSoon,
    };
  }, [filteredContracts]);

  const reportRows = useMemo(
    () => buildReportRows(filteredContracts),
    [filteredContracts],
  );

  const chartData = useMemo(() => {
    if (visualMode === "stage") {
      return aggregateCount(filteredContracts, (contract) =>
        formatStageLabel(contract.stage),
      );
    }

    if (visualMode === "type") {
      return aggregateCount(filteredContracts, (contract) => contract.contractType);
    }

    if (visualMode === "expiration") {
      return aggregateCount(filteredContracts, (contract) => {
        const date = new Date(contract.contractEndDate);
        return Number.isNaN(date.getTime())
          ? "No expiration date"
          : date.getFullYear().toString();
      });
    }

    return aggregateValue(filteredContracts, (contract) => contract.companyName);
  }, [filteredContracts, visualMode]);

  function updateFilter<K extends keyof ReportFilters>(
    key: K,
    value: ReportFilters[K],
  ): void {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function exportReport(format: "csv" | "tsv" | "xls"): void {
    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      downloadTextFile(
        `legal-report-${timestamp}.csv`,
        buildDelimitedExport(reportRows, ","),
        "text/csv;charset=utf-8",
      );
      return;
    }

    if (format === "tsv") {
      downloadTextFile(
        `legal-report-${timestamp}.tsv`,
        buildDelimitedExport(reportRows, "\t"),
        "text/tab-separated-values;charset=utf-8",
      );
      return;
    }

    downloadTextFile(
      `legal-report-${timestamp}.xls`,
      buildExcelXmlExport(reportRows),
      "application/vnd.ms-excel;charset=utf-8",
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Report filters
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Filter submitted contracts by type, counterparty, value,
              expiration date, workflow stage, department, and legal owner.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilters(initialFilters)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Reset filters
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Contract type</span>
            <select
              value={filters.contractType}
              onChange={(event) => updateFilter("contractType", event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
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
            <span className="font-medium text-slate-700">Counterparty</span>
            <select
              value={filters.counterparty}
              onChange={(event) => updateFilter("counterparty", event.target.value)}
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
            <span className="font-medium text-slate-700">Department</span>
            <select
              value={filters.department}
              onChange={(event) => updateFilter("department", event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
            >
              <option value="">All departments</option>
              {options.departments.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Stage</span>
            <select
              value={filters.stage}
              onChange={(event) => updateFilter("stage", event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
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
            <span className="font-medium text-slate-700">Legal owner</span>
            <select
              value={filters.legalOwner}
              onChange={(event) => updateFilter("legalOwner", event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
            >
              <option value="">All owners</option>
              {options.legalOwners.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Min dollar value</span>
            <input
              type="number"
              min={0}
              value={filters.minAmount}
              onChange={(event) => updateFilter("minAmount", event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
              placeholder="No minimum"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Max dollar value</span>
            <input
              type="number"
              min={0}
              value={filters.maxAmount}
              onChange={(event) => updateFilter("maxAmount", event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
              placeholder="No maximum"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Expiration from</span>
            <input
              type="date"
              value={filters.expiresFrom}
              onChange={(event) => updateFilter("expiresFrom", event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Expiration to</span>
            <input
              type="date"
              value={filters.expiresTo}
              onChange={(event) => updateFilter("expiresTo", event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-600">Matching records</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {reportTotals.count}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-600">Total value</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {reportTotals.totalValue.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-600">
            Expiring in 90 days
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {reportTotals.expiringSoon}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Download report output
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Export the filtered report data for Excel or spreadsheet analysis.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportReport("csv")}
              className="rounded-md bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => exportReport("tsv")}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download Excel TSV
            </button>
            <button
              type="button"
              onClick={() => exportReport("xls")}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download Excel XML
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Visual report output
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              View filtered report results as pie charts and bar graphs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "stage", label: "Stage pie" },
              { value: "type", label: "Type pie" },
              { value: "counterpartyValue", label: "Counterparty value" },
              { value: "expiration", label: "Expiration year" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setVisualMode(
                    option.value as
                      | "stage"
                      | "type"
                      | "counterpartyValue"
                      | "expiration",
                  )
                }
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  visualMode === option.value
                    ? "bg-indigo-700 text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          {chartData.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              No report data available for the selected filters.
            </p>
          ) : visualMode === "counterpartyValue" ? (
            <BarChart
              data={chartData}
              valueFormatter={(value) =>
                value.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                })
              }
            />
          ) : visualMode === "expiration" ? (
            <BarChart data={chartData} />
          ) : (
            <DonutChart data={chartData} />
          )}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Report results
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Results update as filters change.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Record
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Contract
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Counterparty
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Expiration
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Stage
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredContracts.map((contract) => (
                <tr key={contract.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                    {resolveContractRecordNumber(contract)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{contract.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {contract.contractType} · {contract.department}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {contract.companyName}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {contract.amount || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {formatContractDate(contract.contractEndDate)}
                  </td>
                  <td className="px-4 py-3">
                    <StageBadge stage={contract.stage} />
                  </td>
                </tr>
              ))}
              {filteredContracts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No contracts match the selected report filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
