import {
  getMicrosoftAccessToken,
  type MicrosoftCredentials,
} from "@/lib/directory-microsoft";
import { extractRecordNumberFromSubject } from "@/lib/email-sources";
import type { ContractEmailDirection } from "@/types/contract";

export interface MicrosoftMailMessage {
  id: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  body: string;
  sentAt: string;
  internetMessageId?: string;
  direction: ContractEmailDirection;
}

interface MicrosoftGraphEmailAddress {
  name?: string | null;
  address?: string | null;
}

interface MicrosoftGraphRecipient {
  emailAddress?: MicrosoftGraphEmailAddress | null;
}

interface MicrosoftGraphMessageBody {
  content?: string | null;
  contentType?: string | null;
}

interface MicrosoftGraphMessage {
  id: string;
  subject?: string | null;
  from?: { emailAddress?: MicrosoftGraphEmailAddress | null } | null;
  toRecipients?: MicrosoftGraphRecipient[] | null;
  ccRecipients?: MicrosoftGraphRecipient[] | null;
  bodyPreview?: string | null;
  body?: MicrosoftGraphMessageBody | null;
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  internetMessageId?: string | null;
}

interface MicrosoftGraphMessagesResponse {
  value?: MicrosoftGraphMessage[];
  "@odata.nextLink"?: string;
}

function formatAddress(recipient?: MicrosoftGraphRecipient | null): string {
  const address = recipient?.emailAddress?.address?.trim() ?? "";
  const name = recipient?.emailAddress?.name?.trim() ?? "";

  if (name && address) {
    return `${name} <${address}>`;
  }

  return address || name;
}

function formatRecipientList(
  recipients: MicrosoftGraphRecipient[] | null | undefined,
): string {
  return (recipients ?? [])
    .map((recipient) => formatAddress(recipient))
    .filter(Boolean)
    .join(", ");
}

function resolveMessageBody(message: MicrosoftGraphMessage): string {
  const bodyContent = message.body?.content?.trim();

  if (bodyContent) {
    return bodyContent;
  }

  return message.bodyPreview?.trim() ?? "";
}

function mapGraphMessage(
  message: MicrosoftGraphMessage,
  mailboxEmail: string,
  direction: ContractEmailDirection,
): MicrosoftMailMessage | null {
  const subject = message.subject?.trim() ?? "";
  const recordNumber = extractRecordNumberFromSubject(subject);

  if (!recordNumber) {
    return null;
  }

  const sentAt =
    message.sentDateTime?.trim() ||
    message.receivedDateTime?.trim() ||
    new Date().toISOString();

  return {
    id: message.id,
    subject,
    from: formatAddress({
      emailAddress: message.from?.emailAddress ?? null,
    }) || mailboxEmail,
    to: formatRecipientList(message.toRecipients),
    cc: formatRecipientList(message.ccRecipients),
    body: resolveMessageBody(message),
    sentAt,
    internetMessageId: message.internetMessageId?.trim() || undefined,
    direction,
  };
}

async function fetchGraphMessagesPage(
  accessToken: string,
  url: string,
): Promise<MicrosoftGraphMessagesResponse> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      errorBody.trim() ||
        `Microsoft Graph mail request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as MicrosoftGraphMessagesResponse;
}

async function fetchFolderMessages(
  accessToken: string,
  mailboxEmail: string,
  folder: "inbox" | "sentitems",
  direction: ContractEmailDirection,
  top = 50,
): Promise<MicrosoftMailMessage[]> {
  const select = [
    "id",
    "subject",
    "from",
    "toRecipients",
    "ccRecipients",
    "bodyPreview",
    "body",
    "receivedDateTime",
    "sentDateTime",
    "internetMessageId",
  ].join(",");
  const orderBy =
    folder === "sentitems" ? "sentDateTime desc" : "receivedDateTime desc";
  const initialUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxEmail)}/mailFolders('${folder}')/messages?$select=${select}&$orderby=${orderBy}&$top=${top}`;
  const page = await fetchGraphMessagesPage(accessToken, initialUrl);

  return (page.value ?? [])
    .map((message) => mapGraphMessage(message, mailboxEmail, direction))
    .filter((message): message is MicrosoftMailMessage => message !== null);
}

export async function fetchMicrosoftContractEmails(
  credentials: MicrosoftCredentials,
  mailboxEmail: string,
): Promise<MicrosoftMailMessage[]> {
  const accessToken = await getMicrosoftAccessToken(credentials);
  const [inbound, outbound] = await Promise.all([
    fetchFolderMessages(accessToken, mailboxEmail, "inbox", "inbound"),
    fetchFolderMessages(accessToken, mailboxEmail, "sentitems", "outbound"),
  ]);

  return [...inbound, ...outbound];
}

export async function sendMicrosoftGraphMail(input: {
  credentials: MicrosoftCredentials;
  senderEmail: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
}): Promise<{ messageId: string; internetMessageId?: string }> {
  const accessToken = await getMicrosoftAccessToken(input.credentials);
  const message = {
    subject: input.subject,
    body: {
      contentType: "Text",
      content: input.body,
    },
    toRecipients: input.to
      .split(/[,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((address) => ({
        emailAddress: { address },
      })),
    ...(input.cc?.trim()
      ? {
          ccRecipients: input.cc
            .split(/[,;]/)
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((address) => ({
              emailAddress: { address },
            })),
        }
      : {}),
  };

  const createResponse = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.senderEmail)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    },
  );

  if (!createResponse.ok) {
    const errorBody = await createResponse.text().catch(() => "");
    throw new Error(
      errorBody.trim() ||
        `Microsoft Graph message create failed with status ${createResponse.status}.`,
    );
  }

  const created = (await createResponse.json()) as MicrosoftGraphMessage;
  const messageId = created.id?.trim();

  if (!messageId) {
    throw new Error("Microsoft Graph did not return a message id.");
  }

  const sendResponse = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(input.senderEmail)}/messages/${encodeURIComponent(messageId)}/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!sendResponse.ok) {
    const errorBody = await sendResponse.text().catch(() => "");
    throw new Error(
      errorBody.trim() ||
        `Microsoft Graph message send failed with status ${sendResponse.status}.`,
    );
  }

  return {
    messageId,
    internetMessageId: created.internetMessageId?.trim() || undefined,
  };
}
