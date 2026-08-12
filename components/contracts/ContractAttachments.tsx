"use client";

import { useEffect, useState } from "react";
import {
  getIntakeDocumentTypeLabel,
  type IntakeDocumentType,
} from "@/lib/intake-documents";
import { formatContractDateTime } from "@/lib/format-dates";
import { UploadContractAttachmentForm } from "@/components/contracts/UploadContractAttachmentForm";
import type { ContractAttachment } from "@/types/contract";

interface ContractAttachmentsProps {
  contractId: string;
  attachments?: ContractAttachment[];
  canUpload?: boolean;
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

function useAttachmentDownloadUrl(
  contractId: string,
  attachmentId: string,
): { url: string | null; error: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDownloadUrl(): Promise<void> {
      setLoading(true);
      setError(null);
      setUrl(null);

      try {
        const response = await fetch(
          `/api/contracts/${contractId}/attachments/${attachmentId}/download`,
        );
        const payload = (await response.json().catch(() => null)) as
          | { url?: string; error?: string }
          | null;

        if (!response.ok || !payload?.url) {
          throw new Error(payload?.error ?? "Unable to load download link.");
        }

        if (!cancelled) {
          setUrl(payload.url);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load download link.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDownloadUrl();

    return () => {
      cancelled = true;
    };
  }, [attachmentId, contractId]);

  return { url, error, loading };
}

function AttachmentPreview({
  attachment,
  downloadUrl,
}: {
  attachment: ContractAttachment;
  downloadUrl: string | null;
}) {
  if (!downloadUrl) {
    return (
      <p className="text-sm text-text-secondary">
        Preview is not available until the download link is ready.
      </p>
    );
  }

  if (attachment.mimeType.startsWith("image/")) {
    return (
      // Signed URLs and data URLs are not compatible with next/image optimization.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={downloadUrl}
        alt={attachment.title}
        className="max-h-48 max-w-full rounded-md border border-border object-contain"
      />
    );
  }

  if (attachment.mimeType === "application/pdf") {
    return (
      <iframe
        src={downloadUrl}
        title={attachment.title}
        className="h-64 w-full rounded-md border border-border bg-white"
      />
    );
  }

  return (
    <p className="text-sm text-text-secondary">
      Preview is not available for this file type. Use Open or Download below.
    </p>
  );
}

function AttachmentActions({
  attachment,
  downloadUrl,
  error,
  loading,
}: {
  attachment: ContractAttachment;
  downloadUrl: string | null;
  error: string | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <span className="text-sm text-text-muted">Loading download link...</span>
    );
  }

  if (error || !downloadUrl) {
    return <span className="text-sm text-rose-600">{error ?? "Unavailable"}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={downloadUrl}
        target={downloadUrl.startsWith("data:") ? undefined : "_blank"}
        rel={downloadUrl.startsWith("data:") ? undefined : "noopener noreferrer"}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-accent hover:bg-surface-muted"
      >
        Open
      </a>
      <a
        href={downloadUrl}
        download={attachment.fileName}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted"
      >
        Download
      </a>
    </div>
  );
}

function AttachmentCard({
  attachment,
  contractId,
}: {
  attachment: ContractAttachment;
  contractId: string;
}) {
  const { url, error, loading } = useAttachmentDownloadUrl(contractId, attachment.id);

  return (
    <article className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto border-b border-border bg-surface-muted">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs font-medium uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Document type</th>
              <th className="px-4 py-3">Uploaded by</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3">File</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-surface">
              <td className="px-4 py-4 align-top">
                <p className="font-medium text-foreground">{attachment.title}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {formatFileSize(attachment.sizeBytes)}
                </p>
              </td>
              <td className="px-4 py-4 align-top text-text-secondary">
                {getIntakeDocumentTypeLabel(
                  attachment.documentType as IntakeDocumentType,
                )}
              </td>
              <td className="px-4 py-4 align-top">
                <p className="font-medium text-foreground">
                  {attachment.uploadedByName}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {attachment.uploadedByEmail}
                </p>
              </td>
              <td className="px-4 py-4 align-top text-text-secondary">
                {formatContractDateTime(attachment.uploadedAt)}
              </td>
              <td className="px-4 py-4 align-top">
                <AttachmentActions attachment={attachment} downloadUrl={url} error={error} loading={loading} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-surface px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Attachment preview
        </p>
        <div className="mt-3">
          <AttachmentPreview attachment={attachment} downloadUrl={url} />
        </div>
      </div>
    </article>
  );
}

export function ContractAttachments({
  contractId,
  attachments = [],
  canUpload = false,
}: ContractAttachmentsProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Attachments</h2>
      <p className="mt-1 text-sm text-text-muted">
        All documents uploaded to this contract record.
      </p>

      {canUpload ? <UploadContractAttachmentForm contractId={contractId} /> : null}

      {attachments.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-border bg-surface-muted px-4 py-6 text-sm text-text-secondary">
          No attachments have been uploaded for this contract yet.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {attachments.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              attachment={attachment}
              contractId={contractId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
