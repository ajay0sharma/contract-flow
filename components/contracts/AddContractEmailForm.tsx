"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addContractEmailAction } from "@/app/actions/contracts";
import {
  FormField,
  inputClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/FormField";
import { parseEmlContent } from "@/lib/eml-parser";
import {
  CONTRACT_EMAIL_SOURCES,
  CONTRACT_EMAIL_SOURCE_LABELS,
  MAX_EML_FILE_BYTES,
  type ContractEmailSource,
} from "@/lib/email-sources";

interface AddContractEmailFormProps {
  contractId: string;
  onSuccess?: () => void;
}

const emptyForm = {
  subject: "",
  from: "",
  to: "",
  cc: "",
  sentAt: "",
  body: "",
};

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read the email file."));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => reject(new Error("Unable to read the email file."));
    reader.readAsText(file);
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read the email file."));
        return;
      }

      const base64 = reader.result.split(",")[1];

      if (!base64) {
        reject(new Error("Unable to read the email file."));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => reject(new Error("Unable to read the email file."));
    reader.readAsDataURL(file);
  });
}

function toDateTimeLocalValue(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AddContractEmailForm({
  contractId,
  onSuccess,
}: AddContractEmailFormProps) {
  const router = useRouter();
  const [source, setSource] = useState<ContractEmailSource>("manual");
  const [form, setForm] = useState(emptyForm);
  const [emlFile, setEmlFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const requiresEmlExport =
    source === "outlook_export" || source === "gmail_export";

  function updateField(field: keyof typeof emptyForm, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleEmlFileChange(file: File | null): Promise<void> {
    setEmlFile(file);
    setError(null);

    if (!file) {
      return;
    }

    if (file.size > MAX_EML_FILE_BYTES) {
      setError("Email export files must be 5 MB or smaller.");
      return;
    }

    try {
      const content = await readFileAsText(file);
      const parsed = parseEmlContent(content);

      setForm({
        subject: parsed.subject,
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        sentAt: toDateTimeLocalValue(parsed.sentAt),
        body: parsed.body,
      });
    } catch {
      setError("Unable to parse the .eml file. You can still enter details manually.");
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (requiresEmlExport && !emlFile) {
      setError("Upload an exported .eml file from Outlook or Gmail.");
      return;
    }

    startTransition(async () => {
      try {
        const emlDataBase64 = emlFile
          ? await readFileAsBase64(emlFile)
          : undefined;

        await addContractEmailAction(contractId, {
          subject: form.subject,
          from: form.from,
          to: form.to,
          cc: form.cc,
          sentAt: form.sentAt
            ? new Date(form.sentAt).toISOString()
            : new Date().toISOString(),
          body: form.body,
          source,
          emlFileName: emlFile?.name,
          emlDataBase64,
        });

        setForm(emptyForm);
        setEmlFile(null);
        setSource("manual");
        setMessage("Email added to the contract record.");
        onSuccess?.();
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to add email to the record.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface-muted p-5">
      <h3 className="text-sm font-semibold text-foreground">Add related email</h3>
      <p className="mt-1 text-sm text-text-secondary">
        Log agreement-related correspondence manually or import an exported
        .eml file from Outlook or Gmail.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField label="Capture method" htmlFor="emailSource">
          <select
            id="emailSource"
            value={source}
            onChange={(event) => {
              const nextSource = event.target.value as ContractEmailSource;
              setSource(nextSource);
              setEmlFile(null);
            }}
            className={selectClassName}
          >
            {CONTRACT_EMAIL_SOURCES.map((option) => (
              <option key={option} value={option}>
                {CONTRACT_EMAIL_SOURCE_LABELS[option]}
              </option>
            ))}
          </select>
        </FormField>

        {requiresEmlExport ? (
          <FormField
            label="Upload .eml export"
            htmlFor="emlUpload"
            hint="Outlook: Save As → .eml. Gmail: Open message → More → Download message."
          >
            <input
              id="emlUpload"
              type="file"
              accept=".eml"
              onChange={(event) => {
                void handleEmlFileChange(event.target.files?.[0] ?? null);
              }}
              className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
            />
          </FormField>
        ) : null}

        <FormField label="Subject" htmlFor="emailSubject">
          <input
            id="emailSubject"
            required
            value={form.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField label="Sent" htmlFor="emailSentAt">
          <input
            id="emailSentAt"
            type="datetime-local"
            required
            value={form.sentAt}
            onChange={(event) => updateField("sentAt", event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField label="From" htmlFor="emailFrom">
          <input
            id="emailFrom"
            required
            value={form.from}
            onChange={(event) => updateField("from", event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField label="To" htmlFor="emailTo">
          <input
            id="emailTo"
            required
            value={form.to}
            onChange={(event) => updateField("to", event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField label="Cc" htmlFor="emailCc">
          <input
            id="emailCc"
            value={form.cc}
            onChange={(event) => updateField("cc", event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <div className="md:col-span-2">
          <FormField label="Message" htmlFor="emailBody">
            <textarea
              id="emailBody"
              rows={4}
              value={form.body}
              onChange={(event) => updateField("body", event.target.value)}
              className={textareaClassName}
            />
          </FormField>
        </div>
      </div>

      {message ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Add email to record"}
      </button>
    </form>
  );
}
