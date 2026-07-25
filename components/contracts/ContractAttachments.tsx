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

function getDataUrl(attachment: ContractAttachment): string {
  return `data:${attachment.mimeType};base64,${attachment.dataBase64}`;
}

function AttachmentPreview({ attachment }: { attachment: ContractAttachment }) {
  const dataUrl = getDataUrl(attachment);

  if (attachment.mimeType.startsWith("image/")) {
    return (
      <img
        src={dataUrl}
        alt={attachment.title}
        className="max-h-48 max-w-full rounded-md border border-border object-contain"
      />
    );
  }

  if (attachment.mimeType === "application/pdf") {
    return (
      <iframe
        src={dataUrl}
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
            <article
              key={attachment.id}
              className="overflow-hidden rounded-lg border border-border"
            >
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
                        <p className="font-medium text-foreground">
                          {attachment.title}
                        </p>
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
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={getDataUrl(attachment)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-accent hover:bg-surface-muted"
                          >
                            Open
                          </a>
                          <a
                            href={getDataUrl(attachment)}
                            download={attachment.fileName}
                            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted"
                          >
                            Download
                          </a>
                        </div>
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
                  <AttachmentPreview attachment={attachment} />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
