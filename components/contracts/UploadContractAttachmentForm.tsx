"use client";

import { useRef, useState, useTransition } from "react";
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
  onUploaded?: () => void | Promise<void>;
  variant?: "default" | "detail";
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
  onUploaded,
  variant = "default",
}: UploadContractAttachmentFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        await onUploaded?.();
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

  const isDetail = variant === "detail";

  return (
    <form
      onSubmit={handleSubmit}
      className={
        isDetail
          ? "rounded-lg border border-blue-200 bg-blue-50 px-4 py-4"
          : "mt-5 rounded-md border border-border bg-surface-muted p-4"
      }
    >
      <h3
        className={
          isDetail
            ? "text-sm font-medium text-blue-950"
            : "text-sm font-medium text-foreground"
        }
      >
        Upload document
      </h3>
      <p
        className={
          isDetail ? "mt-1 text-xs text-blue-900" : "mt-1 text-xs text-text-muted"
        }
      >
        {isDetail
          ? "Add agreements or supporting documents while editing this record."
          : "Support, legal, and admin users can add agreements or supporting documents to this record."}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span
            className={
              isDetail
                ? "font-medium text-blue-950"
                : "font-medium text-foreground"
            }
          >
            Document type
          </span>
          <select
            value={documentType}
            onChange={(event) =>
              setDocumentType(event.target.value as IntakeDocumentType | "")
            }
            className={
              isDetail
                ? "mt-1 w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-gray-900"
                : "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            }
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
          <span
            className={
              isDetail
                ? "font-medium text-blue-950"
                : "font-medium text-foreground"
            }
          >
            File
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className={
              isDetail
                ? "mt-1 block w-full text-sm text-blue-950 file:mr-4 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-950 hover:file:bg-blue-100"
                : "mt-1 block w-full text-sm text-text-secondary file:mr-4 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-border"
            }
          />
        </label>
      </div>
      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className={
          isDetail
            ? "mt-4 rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            : "mt-4 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        }
      >
        {isPending ? "Uploading..." : "Upload document"}
      </button>
    </form>
  );
}
