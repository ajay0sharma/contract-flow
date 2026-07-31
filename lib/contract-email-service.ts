import { sendMicrosoftGraphMail } from "@/lib/contract-email-microsoft-mail";
import { storeProviderMessageId } from "@/lib/contract-email-dedup";
import { decryptCredentials } from "@/lib/po-integration";
import { getDirectoryConfig } from "@/lib/directory-sync";
import type { MicrosoftCredentials } from "@/lib/directory-microsoft";
import { formatContractEmailSubject } from "@/lib/email-sources";
import type { ContractRecord, SendContractEmailInput } from "@/types/contract";

export interface ContractEmailDispatchPayload {
  event: "contract_email_send" | "contract_notification";
  contractId: string;
  recordNumber: string;
  contractUrl: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  sentByEmail?: string;
  sentByName?: string;
  syncWebhookUrl?: string;
}

export interface SendContractEmailResult {
  provider: "microsoft" | "webhook";
  providerMessageId?: string;
  subject: string;
}

function buildContractUrl(contractId: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000";

  return `${baseUrl.replace(/\/$/, "")}/contracts/${contractId}`;
}

function buildInboundSyncWebhookUrl(): string | undefined {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "";

  if (!appUrl) {
    return undefined;
  }

  return `${appUrl.replace(/\/$/, "")}/api/webhooks/contract-email`;
}

export async function dispatchContractEmailPayload(
  payload: ContractEmailDispatchPayload,
): Promise<void> {
  console.info("[contract-email]", payload);

  const webhookUrl = process.env.CONTRACT_EMAIL_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Email provider webhook failed with status ${response.status}.`,
    );
  }
}

async function resolveMicrosoftCredentials(
  organizationId: string,
): Promise<MicrosoftCredentials | null> {
  try {
    const config = await getDirectoryConfig(organizationId);

    if (!config?.isEnabled || config.provider !== "microsoft") {
      return null;
    }

    const credentials = decryptCredentials(
      config.encryptedCredentials,
    ) as Record<string, string>;

    return {
      tenantId: credentials.tenantId ?? "",
      clientId: credentials.clientId ?? "",
      clientSecret: credentials.clientSecret ?? "",
    };
  } catch {
    return null;
  }
}

export async function sendContractRecordEmail(
  contract: ContractRecord,
  input: SendContractEmailInput,
  actor: { name: string; email: string },
  organizationId: string,
): Promise<SendContractEmailResult> {
  const subject = formatContractEmailSubject(contract.recordNumber, input.subject);
  const contractUrl = buildContractUrl(contract.id);
  const payload: ContractEmailDispatchPayload = {
    event: "contract_email_send",
    contractId: contract.id,
    recordNumber: contract.recordNumber,
    contractUrl,
    from: actor.email,
    to: input.to.trim(),
    cc: input.cc?.trim() || undefined,
    subject,
    body: input.body.trim(),
    sentByEmail: actor.email,
    sentByName: actor.name,
    syncWebhookUrl: buildInboundSyncWebhookUrl(),
  };

  const microsoftCredentials = await resolveMicrosoftCredentials(organizationId);

  if (microsoftCredentials) {
    try {
      const graphResult = await sendMicrosoftGraphMail({
        credentials: microsoftCredentials,
        senderEmail: actor.email,
        to: input.to,
        cc: input.cc,
        subject,
        body: [
          input.body.trim(),
          "",
          `Contract record: ${contract.recordNumber}`,
          contractUrl,
        ].join("\n"),
      });

      return {
        provider: "microsoft",
        providerMessageId: storeProviderMessageId(
          graphResult.messageId,
          graphResult.internetMessageId,
        ),
        subject,
      };
    } catch (error) {
      console.error("Microsoft Graph email send failed, falling back:", error);
    }
  }

  const webhookUrl = process.env.CONTRACT_EMAIL_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    throw new Error(
      "No email provider is configured. Enable Microsoft directory integration with Mail.Send or set CONTRACT_EMAIL_WEBHOOK_URL.",
    );
  }

  await dispatchContractEmailPayload(payload);

  return {
    provider: "webhook",
    subject,
  };
}
