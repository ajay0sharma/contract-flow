"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FormField,
  inputClassName,
  textareaClassName,
} from "@/components/ui/FormField";
import { formatContractEmailSubject } from "@/lib/email-sources";

interface SendContractEmailFormProps {
  contractId: string;
  recordNumber: string;
  defaultTo?: string;
  senderEmail: string;
  onSuccess?: () => void;
}

export function SendContractEmailForm({
  contractId,
  recordNumber,
  defaultTo = "",
  senderEmail,
  onSuccess,
}: SendContractEmailFormProps) {
  const router = useRouter();
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formattedSubject = formatContractEmailSubject(recordNumber, subject);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/contracts/${contractId}/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            cc,
            subject,
            body,
          }),
        });

        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(data?.error ?? "Unable to send email.");
        }

        setTo(defaultTo);
        setCc("");
        setSubject("");
        setBody("");
        setMessage("Email sent and logged on this contract record.");
        onSuccess?.();
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to send email.",
        );
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-gray-50 p-5"
    >
      <h3 className="text-sm font-semibold text-gray-900">Send email</h3>
      <p className="mt-1 text-sm text-gray-600">
        Messages are sent from <strong>{senderEmail}</strong>, tagged with{" "}
        <code className="rounded bg-white px-1 py-0.5 text-xs">{recordNumber}</code>
        , and saved to this record for audit.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField label="To" htmlFor="sendEmailTo">
          <input
            id="sendEmailTo"
            required
            type="email"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField label="Cc" htmlFor="sendEmailCc">
          <input
            id="sendEmailCc"
            value={cc}
            onChange={(event) => setCc(event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <FormField
          label="Subject"
          htmlFor="sendEmailSubject"
          hint={`Sent as: ${formattedSubject}`}
        >
          <input
            id="sendEmailSubject"
            required
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className={inputClassName}
          />
        </FormField>

        <div className="md:col-span-2">
          <FormField label="Message" htmlFor="sendEmailBody">
            <textarea
              id="sendEmailBody"
              required
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
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
        className="mt-4 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {isPending ? "Sending..." : "Send email"}
      </button>
    </form>
  );
}
