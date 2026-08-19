"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getIntakeDocumentTypeLabel,
  type IntakeDocumentType,
} from "@/lib/intake-documents";
import { formatContractDateTime } from "@/lib/format-dates";
import { groupAttachmentsByVersion } from "@/lib/contract-attachment-versions";
import type { ContractAttachment } from "@/types/contract";

interface ContractAttachmentVersionGroupsProps {
  contractId: string;
  attachments?: ContractAttachment[];
  variant?: "detail" | "panel";
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

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") {
    return <span className="text-rose-600">PDF</span>;
  }

  if (mimeType.startsWith("image/")) {
    return <span className="text-blue-600">IMG</span>;
  }

  return <span className="text-gray-500">DOC</span>;
}

function AttachmentDownloadLink({
  contractId,
  attachment,
  className,
  label = "Download",
}: {
  contractId: string;
  attachment: ContractAttachment;
  className?: string;
  label?: string;
}) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDownloadUrl(): Promise<void> {
      setDownloadError(null);
      setDownloadUrl(null);

      try {
        const response = await fetch(
          `/api/contracts/${contractId}/attachments/${attachment.id}/download`,
        );
        const payload = (await response.json().catch(() => null)) as
          | { url?: string; error?: string }
          | null;

        if (!response.ok || !payload?.url) {
          throw new Error(payload?.error ?? "Unable to load download link.");
        }

        if (!cancelled) {
          setDownloadUrl(payload.url);
        }
      } catch (error) {
        if (!cancelled) {
          setDownloadError(
            error instanceof Error ? error.message : "Unable to load download link.",
          );
        }
      }
    }

    void loadDownloadUrl();

    return () => {
      cancelled = true;
    };
  }, [attachment.id, contractId]);

  if (downloadError) {
    return <span className="text-xs text-rose-600">{downloadError}</span>;
  }

  if (!downloadUrl) {
    return <span className="text-xs text-gray-400">Loading...</span>;
  }

  return (
    <a
      href={downloadUrl}
      download={attachment.fileName}
      target={downloadUrl.startsWith("data:") ? undefined : "_blank"}
      rel={downloadUrl.startsWith("data:") ? undefined : "noopener noreferrer"}
      className={className}
    >
      {label}
    </a>
  );
}

function VersionBadge({
  versionNumber,
  isCurrent,
}: {
  versionNumber: number;
  isCurrent: boolean;
}) {
  return (
    <span
      className={
        isCurrent
          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
          : "rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500"
      }
    >
      {isCurrent ? "Current" : `Version ${versionNumber}`}
    </span>
  );
}

function AttachmentVersionRow({
  attachment,
  contractId,
  isCurrent,
  compact = false,
}: {
  attachment: ContractAttachment;
  contractId: string;
  isCurrent: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex items-start justify-between gap-3 py-2"
          : "flex items-start gap-3 border-t border-gray-100 pt-4 first:border-t-0 first:pt-0"
      }
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {!compact ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-xs font-semibold">
            <FileTypeIcon mimeType={attachment.mimeType} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={
                compact
                  ? "text-sm text-gray-700"
                  : "text-sm font-medium text-gray-900"
              }
            >
              {attachment.fileName}
            </p>
            <VersionBadge
              versionNumber={attachment.versionNumber ?? 1}
              isCurrent={isCurrent}
            />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {formatFileSize(attachment.sizeBytes)} · Uploaded by{" "}
            {attachment.uploadedByName} on{" "}
            {formatContractDateTime(attachment.uploadedAt)}
          </p>
        </div>
      </div>
      <AttachmentDownloadLink
        contractId={contractId}
        attachment={attachment}
        className="shrink-0 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-gray-50"
      />
    </div>
  );
}

function AttachmentVersionGroupCard({
  contractId,
  documentType,
  current,
  priorVersions,
  variant,
}: {
  contractId: string;
  documentType: IntakeDocumentType;
  current: ContractAttachment;
  priorVersions: ContractAttachment[];
  variant: "detail" | "panel";
}) {
  const [expanded, setExpanded] = useState(false);
  const isPanel = variant === "panel";

  return (
    <article
      className={
        isPanel
          ? "overflow-hidden rounded-lg border border-border"
          : "rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      }
    >
      <div
        className={
          isPanel
            ? "border-b border-border bg-surface-muted px-4 py-3"
            : "border-b border-gray-100 pb-3"
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">
            {getIntakeDocumentTypeLabel(documentType)}
          </p>
          <VersionBadge
            versionNumber={current.versionNumber ?? 1}
            isCurrent
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Current file: {current.fileName}
          {priorVersions.length > 0
            ? ` · ${priorVersions.length} prior version${priorVersions.length === 1 ? "" : "s"} saved`
            : ""}
        </p>
      </div>

      <div className={isPanel ? "bg-surface px-4 py-4" : "pt-4"}>
        <AttachmentVersionRow
          attachment={current}
          contractId={contractId}
          isCurrent
        />

        {priorVersions.length > 0 ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="text-xs font-medium text-blue-700 hover:text-blue-900"
            >
              {expanded
                ? "Hide prior versions"
                : `Show ${priorVersions.length} prior version${priorVersions.length === 1 ? "" : "s"}`}
            </button>

            {expanded ? (
              <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3">
                {priorVersions.map((attachment) => (
                  <AttachmentVersionRow
                    key={attachment.id}
                    attachment={attachment}
                    contractId={contractId}
                    isCurrent={false}
                    compact
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ContractAttachmentVersionGroups({
  contractId,
  attachments = [],
  variant = "detail",
}: ContractAttachmentVersionGroupsProps) {
  const groups = useMemo(
    () => groupAttachmentsByVersion(attachments),
    [attachments],
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className={variant === "panel" ? "mt-5 space-y-6" : "mt-4 space-y-4"}>
      {groups.map((group) => (
        <AttachmentVersionGroupCard
          key={group.versionGroupId}
          contractId={contractId}
          documentType={group.documentType}
          current={group.current}
          priorVersions={group.priorVersions}
          variant={variant}
        />
      ))}
    </div>
  );
}
