"use client";

import { useCallback, useState } from "react";
import { openTemplateDocument } from "@/lib/template-file-access";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import type { TemplateVersionHistoryEntry } from "@/types/contract-template";

interface TemplateVersionHistoryProps {
  templateId: string;
  refreshKey?: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TemplateVersionHistory({
  templateId,
  refreshKey = 0,
}: TemplateVersionHistoryProps) {
  const [versions, setVersions] = useState<TemplateVersionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingVersion, setOpeningVersion] = useState<number | null>(null);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/templates/${templateId}/versions`);
      const payload = (await response.json()) as {
        versions?: TemplateVersionHistoryEntry[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load version history.");
      }

      setVersions(payload.versions ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load version history.",
      );
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useDeferredEffect(() => {
    void loadVersions();
  }, [loadVersions, refreshKey]);

  async function handleOpenVersion(
    version: number,
    intent: "open" | "download",
  ): Promise<void> {
    setOpeningVersion(version);
    setError(null);

    try {
      await openTemplateDocument(templateId, version, intent);
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Unable to open this version.",
      );
    } finally {
      setOpeningVersion(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Version history</h3>
        <p className="mt-1 text-xs text-slate-500">
          Prior versions are archived automatically when you upload a new file.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading versions...</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-slate-400">No versions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Version</th>
                <th className="px-2 py-2">File</th>
                <th className="px-2 py-2">Uploaded</th>
                <th className="px-2 py-2">Change note</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {versions.map((entry) => (
                <tr key={`${entry.templateId}-${entry.version}`}>
                  <td className="whitespace-nowrap px-2 py-2 font-medium text-slate-900">
                    v{entry.version}
                    {entry.isCurrent ? (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                        Current
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Archived
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-slate-600">
                    <p className="max-w-[12rem] truncate">{entry.fileName}</p>
                    <p className="text-xs text-slate-400">
                      {formatFileSize(entry.fileSize)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-slate-600">
                    {formatDateTime(entry.uploadedAt)}
                  </td>
                  <td className="max-w-[10rem] truncate px-2 py-2 text-slate-500">
                    {entry.changeNote || "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={openingVersion === entry.version}
                        onClick={() =>
                          void handleOpenVersion(entry.version, "open")
                        }
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {openingVersion === entry.version ? "Opening..." : "Open"}
                      </button>
                      <button
                        type="button"
                        disabled={openingVersion === entry.version}
                        onClick={() =>
                          void handleOpenVersion(entry.version, "download")
                        }
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Download
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-sm text-rose-700">{error}</p>
      ) : null}
    </section>
  );
}
