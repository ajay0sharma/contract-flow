export const CONTRACT_EMAIL_SOURCES = [
  "manual",
  "outlook_export",
  "gmail_export",
] as const;

export type ContractEmailSource = (typeof CONTRACT_EMAIL_SOURCES)[number];

export const CONTRACT_EMAIL_SOURCE_LABELS: Record<
  ContractEmailSource | "sent" | "provider_sync",
  string
> = {
  manual: "Manual entry",
  outlook_export: "Outlook export (.eml)",
  gmail_export: "Gmail export (.eml)",
  sent: "Sent from ContractFlow",
  provider_sync: "Synced from email provider",
};

export const RECORD_NUMBER_SUBJECT_PATTERN = /\b(CR-\d{6})\b/i;

export function extractRecordNumberFromSubject(subject: string): string | null {
  const match = subject.match(RECORD_NUMBER_SUBJECT_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

export function formatContractEmailSubject(
  recordNumber: string,
  subject: string,
): string {
  const trimmedSubject = subject.trim();
  const normalizedRecordNumber = recordNumber.trim().toUpperCase();

  if (!trimmedSubject) {
    return `[${normalizedRecordNumber}]`;
  }

  if (extractRecordNumberFromSubject(trimmedSubject)) {
    return trimmedSubject;
  }

  return `[${normalizedRecordNumber}] ${trimmedSubject}`;
}

export const MAX_EML_FILE_BYTES = 5 * 1024 * 1024;
