"use client";

import { useEffect, useState } from "react";

interface TemplateAuditEntry {
  id: string;
  entityId: string;
  action: string;
  detail: string | null;
  actorEmail: string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_BADGE_STYLES: Record<string, string> = {
  template_created: "bg-emerald-50 text-emerald-700",
  template_updated: "bg-blue-50 text-blue-700",
  template_version_uploaded: "bg-purple-50 text-purple-700",
  template_deactivated: "bg-red-50 text-red-700",
  template_activated: "bg-emerald-50 text-emerald-700",
  template_set_as_default: "bg-amber-50 text-amber-800",
  template_opened: "bg-indigo-50 text-indigo-700",
  template_downloaded: "bg-slate-100 text-slate-600",
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

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return email.slice(0, 2).toUpperCase();
}

function resolveTemplateTitle(entry: TemplateAuditEntry): string {
  const metadataTitle = entry.metadata?.templateTitle;

  if (typeof metadataTitle === "string" && metadataTitle.trim()) {
    return metadataTitle;
  }

  if (entry.detail) {
    const match = entry.detail.match(/Template "([^"]+)"/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "Template";
}

export function TemplateActivityFeed() {
  const [entries, setEntries] = useState<TemplateAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadActivity() {
      try {
        const response = await fetch("/api/audit/templates");
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load template activity.");
        }

        if (!cancelled) {
          setEntries(payload.entries ?? []);
        }
      } catch {
        if (!cancelled) {
          setEntries([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadActivity();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">
        Recent template activity
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Latest changes to contract templates
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading activity...</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">
          No template changes recorded yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => {
            const badgeStyle =
              ACTION_BADGE_STYLES[entry.action] ?? "bg-slate-100 text-slate-600";
            const badgeLabel =
              ACTION_LABELS[entry.action] ?? entry.action.replaceAll("_", " ");

            return (
              <li
                key={entry.id}
                className="flex items-start gap-3 rounded-lg border border-gray-50 px-2 py-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3558A0]/10 text-xs font-semibold text-[#3558A0]">
                  {getInitials(entry.actorName, entry.actorEmail)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badgeStyle}`}
                    >
                      {badgeLabel}
                    </span>
                    <span className="truncate text-sm font-medium text-gray-900">
                      {resolveTemplateTitle(entry)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatRelativeTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
