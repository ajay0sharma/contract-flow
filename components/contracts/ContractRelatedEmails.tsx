import { AddContractEmailForm } from "@/components/contracts/AddContractEmailForm";
import { SendContractEmailForm } from "@/components/contracts/SendContractEmailForm";
import { formatContractDateTime } from "@/lib/format-dates";
import {
  CONTRACT_EMAIL_SOURCE_LABELS,
  type ContractEmailSource,
} from "@/lib/email-sources";
import type { ContractEmail } from "@/types/contract";

interface ContractRelatedEmailsProps {
  contractId: string;
  recordNumber: string;
  emails: ContractEmail[];
  senderEmail?: string;
  defaultTo?: string;
  canSendEmail?: boolean;
  canAddEmail?: boolean;
  onEmailUpdated?: () => void;
}

function directionLabel(direction: ContractEmail["direction"]): string {
  return direction === "outbound" ? "Sent" : "Received";
}

export function ContractRelatedEmails({
  contractId,
  recordNumber,
  emails = [],
  senderEmail = "",
  defaultTo = "",
  canSendEmail = false,
  canAddEmail = true,
  onEmailUpdated,
}: ContractRelatedEmailsProps) {
  const sortedEmails = [...emails].sort(
    (left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime(),
  );

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">Related emails</h2>
      <p className="mt-1 text-sm text-gray-500">
        Agreement correspondence sent from or captured on this contract record.
      </p>

      <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950">
        <p className="font-medium">Email provider sync</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Legal users can send email from this record. The subject is tagged
            with <code>{recordNumber}</code> for matching and audit.
          </li>
          <li>
            Sent messages are always saved on this contract record immediately
            after the provider accepts the send.
          </li>
          <li>
            Email settings are isolated per client organization. Each client uses
            its own directory integration, mailbox list, outbound webhook URL, and
            inbound webhook secret.
          </li>
          <li>
            Replies and other contract-tagged mail are pulled into the matching
            record on a schedule using only that client&apos;s configured legal
            mailboxes.
          </li>
          <li>
            You can also export a message as <code>.eml</code> from Outlook or
            Gmail and upload it below.
          </li>
        </ul>
      </div>

      {canSendEmail && senderEmail ? (
        <div className="mt-5">
          <SendContractEmailForm
            contractId={contractId}
            recordNumber={recordNumber}
            defaultTo={defaultTo}
            senderEmail={senderEmail}
            onSuccess={onEmailUpdated}
          />
        </div>
      ) : null}

      {canAddEmail ? (
        <div className="mt-5">
          <AddContractEmailForm
            contractId={contractId}
            onSuccess={onEmailUpdated}
          />
        </div>
      ) : null}

      {sortedEmails.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
          No related emails have been captured for this contract yet.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {sortedEmails.map((email) => (
            <article
              key={email.id}
              className="rounded-lg border border-gray-200 bg-gray-50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{email.subject}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {directionLabel(email.direction)} ·{" "}
                    {CONTRACT_EMAIL_SOURCE_LABELS[email.source as ContractEmailSource | "sent" | "provider_sync"]}{" "}
                    · {formatContractDateTime(email.sentAt)}
                  </p>
                </div>
                {email.emlFileName && email.emlDataBase64 ? (
                  <a
                    href={`data:message/rfc822;base64,${email.emlDataBase64}`}
                    download={email.emlFileName}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-gray-100"
                  >
                    Download .eml
                  </a>
                ) : null}
              </div>

              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    From
                  </dt>
                  <dd className="mt-1 text-gray-900">{email.from}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    To
                  </dt>
                  <dd className="mt-1 text-gray-900">{email.to}</dd>
                </div>
                {email.cc ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Cc
                    </dt>
                    <dd className="mt-1 text-gray-900">{email.cc}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Logged by
                  </dt>
                  <dd className="mt-1 text-gray-900">
                    {email.addedByName} · {formatContractDateTime(email.addedAt)}
                  </dd>
                </div>
              </dl>

              {email.body ? (
                <div className="mt-4 rounded-md border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Message
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                    {email.body}
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
