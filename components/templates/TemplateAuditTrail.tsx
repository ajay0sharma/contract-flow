"use client";

import { useCallback, useEffect, useState } from "react";

interface TemplateAuditEntry {
  id: string;
  action: string;
  detail: string | null;
  actorEmail: string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface TemplateAuditTrailProps {
  templateId: string;
  refreshKey?: number;
}

const ACTION_BADGE_STYLES: Record<string, string> = {
  template_created: "bg-emerald-50 text-emerald-700",
  template_updated: "bg-blue-50 text-blue-700",
  template_version_uploaded: "bg-purple-50 text-purple-700",
  template_deactivated: "bg-red-50 text-red-700",
  template_activated: "bg-emerald-50 text-emerald-700",
  template_set_as_default: "bg-amber-50 text-amber-800",
  template_downloaded: "bg-slate-100 text-slate-600",
  template_opened: "bg-indigo-50 text-indigo-700",
};

const ACTION_LABELS: Record<string, string> = {
  template_created: "Created",
  template_updated: "Updated",
  template_version_uploaded: "New version",
  template_deactivated: "Deactivated",
  template_activated: "Activated",
  template_set_as_default: "Set default",
  template_downloaded: "Downloaded",
  template_opened: "Opened",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TemplateAuditTrail({
  templateId,
  refreshKey = 0,
}: TemplateAuditTrailProps) {
  const [entries, setEntries] = useState<TemplateAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAuditTrail = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/templates/${templateId}/audit`);
      const payload = (await response.json()) as {
        entries?: TemplateAuditEntry[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load audit trail.");
      }

      setEntries(payload.entries ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load audit trail.",
      );
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void loadAuditTrail();
  }, [loadAuditTrail, refreshKey]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Audit trail</h3>
        <p className="mt-1 text-xs text-slate-500">
          Uploads, opens, downloads, and metadata changes for this template.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading audit trail...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-400">No activity recorded yet.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => {
            const badgeStyle =
              ACTION_BADGE_STYLES[entry.action] ?? "bg-slate-100 text-slate-600";
            const badgeLabel =
              ACTION_LABELS[entry.action] ?? entry.action.replaceAll("_", " ");

            return (
              <li
                key={entry.id}
                className="rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badgeStyle}`}
                  >
                    {badgeLabel}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
                {entry.detail ? (
                  <p className="mt-1 text-sm text-slate-700">{entry.detail}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  {entry.actorName || entry.actorEmail}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p className="mt-3 text-sm text-rose-700">{error}</p>
      ) : null}
    </section>
  );
}
