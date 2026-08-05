"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { formatContractDate } from "@/lib/format-dates";
import {
  OBLIGATION_TYPE_LABELS,
  OBLIGATION_TYPE_VALUES,
} from "@/lib/obligation-types";

type ObligationStatus = "active" | "completed" | "waived";
type ScanStatus = "not_scanned" | "scanning" | "completed" | "failed";

interface ObligationRecord {
  id: string;
  description: string;
  obligationType: string;
  dueDate: string | null;
  isRecurring: boolean;
  frequency: string | null;
  noticePeriodDays: number | null;
  responsibleParty: string | null;
  sourceClause: string | null;
  status: ObligationStatus;
}

interface ExecutedDocumentInfo {
  name: string | null;
  size: number | null;
  uploadedAt: string | null;
  uploadedById: string | null;
}

interface ObligationPanelData {
  executedDocument: ExecutedDocumentInfo | null;
  scanStatus: ScanStatus;
  scanCompletedAt: string | null;
  scanVersion: number | null;
  obligations: ObligationRecord[];
}

interface ContractObligationsCardProps {
  contractId: string;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return formatContractDate(iso);
}

function isOverdue(dueDate: string | null, status: ObligationStatus): boolean {
  if (!dueDate || status !== "active") {
    return false;
  }

  return new Date(dueDate).getTime() < Date.now();
}

function UploadIcon() {
  return (
    <svg className="mx-auto h-6 w-6 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M12 16V4m0 0L7 9m5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" strokeLinecap="round" />
    </svg>
  );
}

function RobotIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
      <path d="M12 8V5" strokeLinecap="round" />
      <circle cx="12" cy="4" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ContractObligationsCard({ contractId }: ContractObligationsCardProps) {
  const [data, setData] = useState<ObligationPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPanel = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/${contractId}/obligation-panel`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load obligations.");
      }

      setData(payload);
      setExpandedGroups(
        Object.fromEntries(
          OBLIGATION_TYPE_VALUES.map((type) => [type, true]),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load obligations.",
      );
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useDeferredEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  const groupedObligations = useMemo(() => {
    const groups = new Map<string, ObligationRecord[]>();

    for (const obligation of data?.obligations ?? []) {
      const existing = groups.get(obligation.obligationType) ?? [];
      existing.push(obligation);
      groups.set(obligation.obligationType, existing);
    }

    return Array.from(groups.entries()).sort(([left], [right]) =>
      (OBLIGATION_TYPE_LABELS[left] ?? left).localeCompare(
        OBLIGATION_TYPE_LABELS[right] ?? right,
      ),
    );
  }, [data?.obligations]);

  const summary = useMemo(() => {
    const obligations = data?.obligations ?? [];
    const typeCount = new Set(obligations.map((item) => item.obligationType)).size;
    const completed = obligations.filter((item) => item.status === "completed").length;
    const active = obligations.filter((item) => item.status === "active").length;

    return { total: obligations.length, typeCount, completed, active };
  }, [data?.obligations]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("document", file);

      const response = await fetch(
        `/api/contracts/${contractId}/upload-executed`,
        { method: "POST", body: formData },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      setReplacing(false);
      await loadPanel();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload() {
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${contractId}/download-executed`,
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Download failed.");
      }

      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Download failed.",
      );
    }
  }

  async function handleScan() {
    setScanning(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${contractId}/scan-obligations`,
        { method: "POST" },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Scan failed.");
      }

      await loadPanel();
    } catch (scanError) {
      setError(
        scanError instanceof Error ? scanError.message : "Scan failed.",
      );
      await loadPanel();
    } finally {
      setScanning(false);
    }
  }

  async function updateStatus(id: string, status: ObligationStatus) {
    setOpenMenuId(null);

    try {
      const response = await fetch(`/api/obligations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
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
            item.id === id ? { ...item, status } : item,
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

  const scanStatus = scanning ? "scanning" : data?.scanStatus ?? "not_scanned";
  const hasExecutedDocument = Boolean(data?.executedDocument?.name);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-gray-100 pb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
          Obligations
        </h2>

        <div className="flex flex-col items-end gap-2">
          {!hasExecutedDocument ? (
            <p className="text-xs italic text-gray-400">
              Upload the executed agreement below to enable obligation scanning
            </p>
          ) : scanStatus === "scanning" ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#3558A0]" />
              Scanning...
            </div>
          ) : scanStatus === "completed" ? (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => void handleScan()}
                disabled={scanning}
                className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              >
                <RobotIcon />
                Re-scan
              </button>
              {data?.scanCompletedAt ? (
                <p className="text-xs text-gray-400">
                  Last scanned {formatRelativeTime(data.scanCompletedAt)}
                </p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleScan()}
              disabled={scanning}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
            >
              <RobotIcon />
              Scan for obligations
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="mb-5">
        <p className="text-xs uppercase tracking-wide text-gray-400">
          Executed agreement
        </p>

        {loading ? (
          <p className="mt-3 text-sm text-gray-400">Loading...</p>
        ) : !hasExecutedDocument || replacing ? (
          <div className="mt-3 rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
            <UploadIcon />
            <p className="mt-3 text-sm font-medium text-gray-700">
              Upload the fully executed and signed agreement
            </p>
            <p className="mt-1 text-xs text-gray-400">
              PDF or Word document, max 50MB
            </p>
            {replacing ? (
              <p className="mt-2 text-xs text-amber-600">
                Replacing the executed document will require a new obligation scan
              </p>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleUpload(file);
                }
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-4 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Choose file"}
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-emerald-600" aria-hidden="true">✓</span>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {data?.executedDocument?.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(data?.executedDocument?.size ?? null)}
                  {data?.executedDocument?.uploadedAt
                    ? ` · Uploaded ${formatRelativeTime(data.executedDocument.uploadedAt)}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleDownload()}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => setReplacing(true)}
                className="text-xs font-medium text-blue-700 hover:text-blue-900"
              >
                Replace
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? null : summary.total > 0 ? (
        <p className="mb-4 text-xs text-gray-500">
          {summary.total} obligations identified across {summary.typeCount} types ·{" "}
          {summary.completed} completed · {summary.active} active
        </p>
      ) : scanStatus === "not_scanned" ? (
        <p className="py-6 text-center text-sm text-gray-400">
          No obligations scanned yet
        </p>
      ) : null}

      <div className="space-y-4">
        {groupedObligations.map(([type, obligations]) => {
          const expanded = expandedGroups[type] ?? true;

          return (
            <div key={type} className="rounded-xl border border-gray-100">
              <button
                type="button"
                onClick={() =>
                  setExpandedGroups((current) => ({
                    ...current,
                    [type]: !expanded,
                  }))
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {OBLIGATION_TYPE_LABELS[type] ?? type}
                  </p>
                  <p className="text-xs text-gray-400">({obligations.length})</p>
                </div>
                <ChevronIcon expanded={expanded} />
              </button>

              {expanded ? (
                <div className="divide-y divide-gray-50 border-t border-gray-100">
                  {obligations.map((obligation) => {
                    const completed = obligation.status === "completed";
                    const waived = obligation.status === "waived";

                    return (
                      <div
                        key={obligation.id}
                        className="group flex items-start gap-3 px-4 py-3 hover:bg-blue-50/20"
                      >
                        <input
                          type="checkbox"
                          checked={completed}
                          onChange={() =>
                            void updateStatus(
                              obligation.id,
                              completed ? "active" : "completed",
                            )
                          }
                          className="mt-1 h-4 w-4 rounded border-gray-300"
                        />

                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm text-gray-800 ${
                              completed ? "line-through opacity-60" : ""
                            }`}
                          >
                            {obligation.description}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                            {obligation.dueDate ? (
                              <span
                                className={
                                  isOverdue(obligation.dueDate, obligation.status)
                                    ? "text-red-600"
                                    : ""
                                }
                              >
                                📅 {formatContractDate(obligation.dueDate)}
                              </span>
                            ) : null}
                            {obligation.isRecurring && obligation.frequency ? (
                              <span>↻ {obligation.frequency}</span>
                            ) : null}
                            {obligation.noticePeriodDays ? (
                              <span>⏱ {obligation.noticePeriodDays} days notice</span>
                            ) : null}
                            {obligation.sourceClause ? (
                              <span>§ {obligation.sourceClause}</span>
                            ) : null}
                            {obligation.responsibleParty ? (
                              <span>👤 {obligation.responsibleParty}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {completed ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Done
                            </span>
                          ) : null}
                          {waived ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                              Waived
                            </span>
                          ) : null}

                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuId((current) =>
                                  current === obligation.id ? null : obligation.id,
                                )
                              }
                              className="rounded px-2 py-1 text-sm text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700"
                            >
                              ...
                            </button>
                            {openMenuId === obligation.id ? (
                              <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateStatus(obligation.id, "completed")
                                  }
                                  className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  Mark complete
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateStatus(obligation.id, "waived")
                                  }
                                  className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  Mark waived
                                </button>
                                {obligation.sourceClause ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      window.alert(obligation.sourceClause ?? "")
                                    }
                                    className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                                  >
                                    View source clause
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
