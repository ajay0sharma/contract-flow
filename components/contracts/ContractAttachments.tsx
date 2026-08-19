"use client";

import { UploadContractAttachmentForm } from "@/components/contracts/UploadContractAttachmentForm";
import { ContractAttachmentVersionGroups } from "@/components/contracts/ContractAttachmentVersionGroups";
import type { ContractAttachment } from "@/types/contract";

interface ContractAttachmentsProps {
  contractId: string;
  attachments?: ContractAttachment[];
  canUpload?: boolean;
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
        All documents uploaded to this contract record. Uploading the same
        document type again saves a new version and keeps prior versions visible.
      </p>

      {canUpload ? <UploadContractAttachmentForm contractId={contractId} /> : null}

      {attachments.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-border bg-surface-muted px-4 py-6 text-sm text-text-secondary">
          No attachments have been uploaded for this contract yet.
        </p>
      ) : (
        <ContractAttachmentVersionGroups
          contractId={contractId}
          attachments={attachments}
          variant="panel"
        />
      )}
    </div>
  );
}
