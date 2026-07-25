"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addContractAttachmentAction } from "@/app/actions/contracts";
import {
  INTAKE_DOCUMENT_TYPE_LABELS,
  INTAKE_DOCUMENT_TYPES,
  MAX_INTAKE_ATTACHMENT_BYTES,
  type IntakeDocumentType,
} from "@/lib/intake-documents";

interface UploadContractAttachmentFormProps {
  contractId: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read the selected file."));
        return;
      }

      const base64 = reader.result.split(",")[1];

      if (!base64) {
        reject(new Error("Unable to read the selected file."));
        return;
      }

      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Unable to read the selected file."));
    reader.readAsDataURL(file);
  });
}

export function UploadContractAttachmentForm({
  contractId,
}: UploadContractAttachmentFormProps) {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<IntakeDocumentType | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!documentType || !file) {
      setError("Select a document type and file to upload.");
      return;
    }

    if (file.size > MAX_INTAKE_ATTACHMENT_BYTES) {
      setError("Attached documents must be 10 MB or smaller.");
      return;
    }

    startTransition(async () => {
      try {
        await addContractAttachmentAction(contractId, {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          documentType,
          dataBase64: await readFileAsBase64(file),
        });
        setMessage(`Uploaded ${file.name}.`);
        setDocumentType("");
        setFile(null);
        router.refresh();
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Unable to upload document.",
        );
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 rounded-md border border-border bg-surface-muted p-4"
    >
      <h3 className="text-sm font-medium text-foreground">Upload document</h3>
      <p className="mt-1 text-xs text-text-muted">
        Support, legal, and admin users can add agreements or supporting
        documents to this record.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Document type</span>
          <select
            value={documentType}
            onChange={(event) =>
              setDocumentType(event.target.value as IntakeDocumentType | "")
            }
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          >
            <option value="">Select document type</option>
            {INTAKE_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {INTAKE_DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">File</span>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-text-secondary file:mr-4 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-border"
          />
        </label>
      </div>
      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="mt-4 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Uploading..." : "Upload document"}
      </button>
    </form>
  );
}
