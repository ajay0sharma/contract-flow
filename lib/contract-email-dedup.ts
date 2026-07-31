import type { ContractEmail } from "@/types/contract";

export function normalizeEmailAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const angleMatch = trimmed.match(/<([^>]+)>/);

  if (angleMatch?.[1]) {
    return angleMatch[1].trim();
  }

  const emailMatch = trimmed.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return emailMatch?.[0] ?? trimmed;
}

export function normalizeRecipientField(value: string): string {
  return value
    .split(/[,;]/)
    .map((entry) => normalizeEmailAddress(entry))
    .filter(Boolean)
    .sort()
    .join(",");
}

export function buildRelatedEmailFingerprint(input: {
  subject: string;
  from: string;
  to: string;
  sentAt: string;
}): string {
  const normalize = (value: string) => value.trim().toLowerCase();
  const sentMinute = input.sentAt.slice(0, 16);

  return [
    normalize(input.subject),
    normalizeRecipientField(input.from),
    normalizeRecipientField(input.to),
    sentMinute,
  ].join("|");
}

export function hasMatchingRelatedEmail(
  emails: ContractEmail[],
  input: {
    subject: string;
    from: string;
    to: string;
    sentAt: string;
    providerMessageId?: string;
    internetMessageId?: string;
  },
): boolean {
  if (input.providerMessageId) {
    const providerMatch = emails.some(
      (email) => email.providerMessageId === input.providerMessageId,
    );

    if (providerMatch) {
      return true;
    }
  }

  if (input.internetMessageId) {
    const internetMatch = emails.some(
      (email) => email.providerMessageId === input.internetMessageId,
    );

    if (internetMatch) {
      return true;
    }
  }

  const fingerprint = buildRelatedEmailFingerprint(input);

  return emails.some((email) => {
    if (email.providerMessageId === fingerprint) {
      return true;
    }

    return buildRelatedEmailFingerprint(email) === fingerprint;
  });
}

export function storeProviderMessageId(
  providerMessageId?: string,
  internetMessageId?: string,
): string | undefined {
  return providerMessageId?.trim() || internetMessageId?.trim() || undefined;
}

export function findMatchingRelatedEmail(
  emails: ContractEmail[],
  input: {
    subject: string;
    from: string;
    to: string;
    sentAt: string;
    providerMessageId?: string;
    internetMessageId?: string;
  },
): ContractEmail | undefined {
  if (input.providerMessageId) {
    const byProviderId = emails.find(
      (email) => email.providerMessageId === input.providerMessageId,
    );

    if (byProviderId) {
      return byProviderId;
    }
  }

  if (input.internetMessageId) {
    const byInternetId = emails.find(
      (email) => email.providerMessageId === input.internetMessageId,
    );

    if (byInternetId) {
      return byInternetId;
    }
  }

  const fingerprint = buildRelatedEmailFingerprint(input);

  return emails.find(
    (email) => buildRelatedEmailFingerprint(email) === fingerprint,
  );
}
