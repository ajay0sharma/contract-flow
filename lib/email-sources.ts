export const CONTRACT_EMAIL_SOURCES = [
  "manual",
  "outlook_export",
  "gmail_export",
] as const;

export type ContractEmailSource = (typeof CONTRACT_EMAIL_SOURCES)[number];

export const CONTRACT_EMAIL_SOURCE_LABELS: Record<ContractEmailSource, string> =
  {
    manual: "Manual entry",
    outlook_export: "Outlook export (.eml)",
    gmail_export: "Gmail export (.eml)",
  };

export const MAX_EML_FILE_BYTES = 5 * 1024 * 1024;
