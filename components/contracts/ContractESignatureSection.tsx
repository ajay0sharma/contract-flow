"use client";

import { useCallback, useMemo, useState } from "react";
import { formatAuditTimestamp } from "@/lib/format-dates";
import { isSafeExternalUrl } from "@/lib/signature-url";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import type { ContractRecord } from "@/types/contract";
import type { SignatureEnvelopeView } from "@/types/signature-integration";

interface ContractESignatureSectionProps {
  contract: ContractRecord;
  userEmail: string;
  userName: string;
  onEnvelopeSent?: () => void;
}

const FIELD_CLASS =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

function openApplicationUrl(url: string): void {
  if (!isSafeExternalUrl(url)) {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function ContractESignatureSection({
  contract,
  userEmail,
  userName,
  onEnvelopeSent,
}: ContractESignatureSectionProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<SignatureEnvelopeView | null>(null);
  const [counterpartyEmail, setCounterpartyEmail] = useState(
    contract.mainContactEmail?.trim() ?? "",
  );
  const [counterpartyName, setCounterpartyName] = useState(
    contract.mainContactName?.trim() ||
      contract.companyName?.trim() ||
      "",
  );
  const [internalSignerEmail, setInternalSignerEmail] = useState(userEmail);
  const [internalSignerName, setInternalSignerName] = useState(userName);

  const defaultCounterpartyEmail = useMemo(
    () => contract.mainContactEmail?.trim() ?? "",
    [contract.mainContactEmail],
  );
  const defaultCounterpartyName = useMemo(
    () =>
      contract.mainContactName?.trim() ||
      contract.companyName?.trim() ||
      "",
    [contract.companyName, contract.mainContactName],
  );

  const loadSignatureStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${contract.id}/signature-status`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error("Unable to load e-signature status.");
      }

      const payload = (await response.json()) as {
        configured: boolean;
        displayName: string;
        envelope: SignatureEnvelopeView | null;
      };

      setConfigured(payload.configured);
      setProviderName(payload.displayName);
      setEnvelope(payload.envelope);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load e-signature status.",
      );
    } finally {
      setLoading(false);
    }
  }, [contract.id]);

  useDeferredEffect(() => {
    if (contract.stage !== "awaiting_signature") {
      return;
    }

    void loadSignatureStatus();
  }, [contract.id, contract.stage, loadSignatureStatus]);

  useDeferredEffect(() => {
    if (contract.stage !== "awaiting_signature") {
      return;
    }

    setCounterpartyEmail(defaultCounterpartyEmail);
    setCounterpartyName(defaultCounterpartyName);
    setInternalSignerEmail(userEmail);
    setInternalSignerName(userName);
  }, [
    contract.id,
    contract.stage,
    defaultCounterpartyEmail,
    defaultCounterpartyName,
    userEmail,
    userName,
  ]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/contracts/${contract.id}/send-for-signature`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            counterparty: {
              email: counterpartyEmail.trim(),
              name: counterpartyName.trim(),
            },
            internalSigner: {
              email: internalSignerEmail.trim(),
              name: internalSignerName.trim(),
            },
          }),
        },
      );

      const payload = (await response.json()) as SignatureEnvelopeView & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to initiate e-signature.");
      }

      setEnvelope(payload);
      onEnvelopeSent?.();

      if (payload.applicationUrl) {
        openApplicationUrl(payload.applicationUrl);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to initiate e-signature.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (contract.stage !== "awaiting_signature") {
    return null;
  }

  return (
    <section
      id="e-signature"
      className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <h2 className="text-base font-semibold text-gray-900">E-signature</h2>
      <p className="mt-1 text-sm text-gray-500">
        Confirm the counterparty and internal signers, then launch your
        organization&apos;s e-signature application for this contract.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading e-signature status…</p>
      ) : null}

      {!loading && !configured ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          E-signature is not configured for this client yet. Ask an admin to
          enable it under Admin → E-signature.
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-rose-700">{error}</p>
      ) : null}

      {envelope ? (
        <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-teal-950">
          <p className="font-medium">
            Sent via {providerName ?? "e-signature"}
          </p>
          <p className="mt-1 capitalize">
            Status: {envelope.status.replaceAll("_", " ")}
          </p>
          {envelope.sentAt ? (
            <p className="mt-1 text-teal-900">
              Sent {formatAuditTimestamp(envelope.sentAt)}
            </p>
          ) : null}
          {envelope.signers.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-teal-900">
              {envelope.signers.map((signer) => (
                <li key={`${signer.role}-${signer.email}`}>
                  {signer.role === "internal" ? "Internal" : "Counterparty"}:{" "}
                  {signer.name} ({signer.email})
                </li>
              ))}
            </ul>
          ) : null}
          {envelope.applicationUrl ? (
            <button
              type="button"
              onClick={() => openApplicationUrl(envelope.applicationUrl!)}
              className="mt-4 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
            >
              Open e-signature application
            </button>
          ) : null}
        </div>
      ) : configured ? (
        <>
          {!defaultCounterpartyEmail ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              No counterparty email is saved on this contract yet. Enter the key
              contact details below before sending for signature.
            </div>
          ) : null}
        <form className="mt-5 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900">
                Counterparty signer
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Key contact who will sign on behalf of the counterparty.
              </p>
              <label className="mt-4 block text-xs font-medium text-gray-700">
                Name
                <input
                  type="text"
                  required
                  value={counterpartyName}
                  onChange={(event) => setCounterpartyName(event.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              <label className="mt-3 block text-xs font-medium text-gray-700">
                Email
                <input
                  type="email"
                  required
                  value={counterpartyEmail}
                  onChange={(event) => setCounterpartyEmail(event.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-900">
                Internal signer
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Organization representative who countersigns the agreement.
              </p>
              <label className="mt-4 block text-xs font-medium text-gray-700">
                Name
                <input
                  type="text"
                  required
                  value={internalSignerName}
                  onChange={(event) => setInternalSignerName(event.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              <label className="mt-3 block text-xs font-medium text-gray-700">
                Email
                <input
                  type="email"
                  required
                  value={internalSignerEmail}
                  onChange={(event) => setInternalSignerEmail(event.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {submitting ? "Launching…" : "Send for signature"}
            </button>
            <p className="text-xs text-gray-500">
              Provider: {providerName ?? "Configured e-signature app"}
            </p>
          </div>
        </form>
        </>
      ) : null}
    </section>
  );
}
