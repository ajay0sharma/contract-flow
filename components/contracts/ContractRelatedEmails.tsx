import { AddContractEmailForm } from "@/components/contracts/AddContractEmailForm";
import { formatContractDateTime } from "@/lib/format-dates";
import {
  CONTRACT_EMAIL_SOURCE_LABELS,
  type ContractEmailSource,
} from "@/lib/email-sources";
import type { ContractEmail } from "@/types/contract";

interface ContractRelatedEmailsProps {
  contractId: string;
  emails: ContractEmail[];
  canAddEmail?: boolean;
}

export function ContractRelatedEmails({
  contractId,
  emails = [],
  canAddEmail = true,
}: ContractRelatedEmailsProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Related emails</h2>
      <p className="mt-1 text-sm text-text-muted">
        Agreement correspondence captured on this contract record.
      </p>

      <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950">
        <p className="font-medium">Outlook and Gmail options</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Today:</strong> export a message as <code>.eml</code> from
            Outlook or Gmail and upload it here. Headers and message text are
            parsed automatically.
          </li>
          <li>
            <strong>Outlook:</strong> open the message → File → Save As →
            choose <code>.eml</code>.
          </li>
          <li>
            <strong>Gmail:</strong> open the message → More (⋮) → Download
            message.
          </li>
          <li>
            <strong>Future live sync:</strong> direct inbox integration would
            use Microsoft Graph (Outlook) or the Gmail API with OAuth and
            admin consent. That is not wired up in this demo yet.
          </li>
        </ul>
      </div>

      {canAddEmail ? (
        <div className="mt-5">
          <AddContractEmailForm contractId={contractId} />
        </div>
      ) : null}

      {emails.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-border bg-surface-muted px-4 py-6 text-sm text-text-secondary">
          No related emails have been captured for this contract yet.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {emails.map((email) => (
            <article
              key={email.id}
              className="rounded-lg border border-border bg-surface-muted p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{email.subject}</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {CONTRACT_EMAIL_SOURCE_LABELS[email.source as ContractEmailSource]}{" "}
                    · Sent {formatContractDateTime(email.sentAt)}
                  </p>
                </div>
                {email.emlFileName && email.emlDataBase64 ? (
                  <a
                    href={`data:message/rfc822;base64,${email.emlDataBase64}`}
                    download={email.emlFileName}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-accent hover:bg-surface-muted"
                  >
                    Download .eml
                  </a>
                ) : null}
              </div>

              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    From
                  </dt>
                  <dd className="mt-1 text-foreground">{email.from}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    To
                  </dt>
                  <dd className="mt-1 text-foreground">{email.to}</dd>
                </div>
                {email.cc ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      Cc
                    </dt>
                    <dd className="mt-1 text-foreground">{email.cc}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    Captured by
                  </dt>
                  <dd className="mt-1 text-foreground">
                    {email.addedByName} · {formatContractDateTime(email.addedAt)}
                  </dd>
                </div>
              </dl>

              {email.body ? (
                <div className="mt-4 rounded-md border border-border bg-surface px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    Message
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                    {email.body}
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
