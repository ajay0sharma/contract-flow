import { storeProviderMessageId } from "@/lib/contract-email-dedup";
import {
  fetchMicrosoftContractEmails,
  type MicrosoftMailMessage,
} from "@/lib/contract-email-microsoft-mail";
import {
  syncInboundContractEmailAndPersist,
  type InboundContractEmailInput,
} from "@/lib/contract-persistence";
import { getDirectoryConfig } from "@/lib/directory-sync";
import type { MicrosoftCredentials } from "@/lib/directory-microsoft";
import { extractRecordNumberFromSubject } from "@/lib/email-sources";
import {
  getLegalMailboxEmailsForOrganization,
  getOrganizationEmailConfig,
  isOrganizationEmailSyncEnabled,
  listOrganizationsWithEmailSyncEnabled,
  recordOrganizationEmailSyncResult,
} from "@/lib/organization-email-config";
import { decryptCredentials } from "@/lib/po-integration";
import { isDatabaseConfigured } from "@/lib/prisma";

export interface ContractEmailSyncResult {
  organizationId: string;
  success: boolean;
  mailboxesChecked: number;
  messagesScanned: number;
  messagesCaptured: number;
  duplicatesSkipped: number;
  errors: string[];
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

function toInboundInput(message: MicrosoftMailMessage): InboundContractEmailInput {
  return {
    recordNumber: extractRecordNumberFromSubject(message.subject) ?? undefined,
    subject: message.subject,
    from: message.from,
    to: message.to,
    cc: message.cc,
    body: message.body,
    sentAt: message.sentAt,
    provider: "microsoft",
    providerMessageId: storeProviderMessageId(
      message.id,
      message.internetMessageId,
    ),
    direction: message.direction,
  };
}

export async function syncContractEmailsForOrganization(
  organizationId: string,
): Promise<ContractEmailSyncResult> {
  const result: ContractEmailSyncResult = {
    organizationId,
    success: true,
    mailboxesChecked: 0,
    messagesScanned: 0,
    messagesCaptured: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  const emailConfig = await getOrganizationEmailConfig(organizationId);

  if (!isOrganizationEmailSyncEnabled(emailConfig)) {
    result.errors.push("Contract email sync is disabled for this client.");
    result.success = false;
    return result;
  }

  if (!isDatabaseConfigured()) {
    result.errors.push("Database is required for contract email sync.");
    result.success = false;
    return result;
  }

  const credentials = await resolveMicrosoftCredentials(organizationId);

  if (!credentials) {
    result.errors.push(
      "Microsoft directory integration is not configured for this client.",
    );
    result.success = false;
    return result;
  }

  const mailboxEmails = await getLegalMailboxEmailsForOrganization(organizationId);

  if (mailboxEmails.length === 0) {
    result.errors.push(
      "No legal mailboxes are configured for this client. Add mailbox emails in client email settings or sync Legal department users from directory.",
    );
    result.success = false;
    return result;
  }

  for (const mailboxEmail of mailboxEmails) {
    result.mailboxesChecked += 1;

    try {
      const messages = await fetchMicrosoftContractEmails(
        credentials,
        mailboxEmail,
      );
      result.messagesScanned += messages.length;

      for (const message of messages) {
        const syncResult = await syncInboundContractEmailAndPersist(
          organizationId,
          toInboundInput(message),
        );

        if (!syncResult) {
          continue;
        }

        if (syncResult.duplicate) {
          result.duplicatesSkipped += 1;
          continue;
        }

        result.messagesCaptured += 1;
      }
    } catch (error) {
      result.success = false;
      result.errors.push(
        `${mailboxEmail}: ${
          error instanceof Error ? error.message : "Mailbox sync failed."
        }`,
      );
    }
  }

  await recordOrganizationEmailSyncResult(organizationId, {
    success: result.success,
    error: result.errors.join(" ") || null,
  });

  return result;
}

export async function syncContractEmailsForAllOrganizations(): Promise<{
  checked: number;
  synced: number;
  results: ContractEmailSyncResult[];
}> {
  const organizationIds = await listOrganizationsWithEmailSyncEnabled();
  const results: ContractEmailSyncResult[] = [];

  for (const organizationId of organizationIds) {
    results.push(await syncContractEmailsForOrganization(organizationId));
  }

  return {
    checked: organizationIds.length,
    synced: results.filter((result) => result.success).length,
    results,
  };
}
