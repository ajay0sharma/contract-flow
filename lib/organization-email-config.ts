import { getAllowedOrganizationIds, resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { getDirectoryConfig } from "@/lib/directory-sync";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import { decryptCredentials, encryptCredentials } from "@/lib/po-integration";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

export interface OrganizationEmailConfigRecord {
  organizationId: string;
  syncEnabled: boolean;
  outboundWebhookUrl: string | null;
  mailboxEmails: string[];
  hasWebhookSecret: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export interface OrganizationEmailConfigInput {
  syncEnabled?: boolean;
  outboundWebhookUrl?: string | null;
  webhookSecret?: string | null;
  mailboxEmails?: string[];
}

type EmailConfigRow = {
  organizationId: string;
  syncEnabled: boolean;
  outboundWebhookUrl: string | null;
  encryptedWebhookSecret: string | null;
  mailboxEmails: unknown;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
};

const globalEmailConfigStore = globalThis as typeof globalThis & {
  __organizationEmailConfigStore?: Map<string, OrganizationEmailConfigRecord>;
};

function getMemoryStore(): Map<string, OrganizationEmailConfigRecord> {
  if (!globalEmailConfigStore.__organizationEmailConfigStore) {
    globalEmailConfigStore.__organizationEmailConfigStore = new Map();
  }

  return globalEmailConfigStore.__organizationEmailConfigStore;
}

function parseMailboxEmails(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry).trim().toLowerCase())
    .filter(Boolean);
}

function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeMailboxEmails(emails: string[]): string[] {
  const normalized = emails.map((email) => email.trim().toLowerCase()).filter(Boolean);
  const invalid = normalized.filter((email) => !isValidEmailAddress(email));

  if (invalid.length > 0) {
    throw new Error(`Invalid mailbox email address: ${invalid[0]}`);
  }

  return [...new Set(normalized)];
}

function buildDefaultConfig(organizationId: string): OrganizationEmailConfigRecord {
  return {
    organizationId,
    syncEnabled: true,
    outboundWebhookUrl: null,
    mailboxEmails: [],
    hasWebhookSecret: false,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
  };
}

function mapEmailConfigRow(row: EmailConfigRow): OrganizationEmailConfigRecord {
  return {
    organizationId: row.organizationId,
    syncEnabled: row.syncEnabled,
    outboundWebhookUrl: row.outboundWebhookUrl,
    mailboxEmails: parseMailboxEmails(row.mailboxEmails),
    hasWebhookSecret: Boolean(row.encryptedWebhookSecret?.trim()),
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row.lastSyncStatus,
    lastSyncError: row.lastSyncError,
  };
}

export async function getOrganizationEmailConfig(
  organizationId: string,
): Promise<OrganizationEmailConfigRecord> {
  if (!isDatabaseConfigured()) {
    return getMemoryStore().get(organizationId) ?? buildDefaultConfig(organizationId);
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.organizationEmailConfig.findUnique({
      where: { organizationId },
    });

    if (record) {
      return mapEmailConfigRow(record);
    }
  } catch {
    // Fall through to memory/default.
  }

  return getMemoryStore().get(organizationId) ?? buildDefaultConfig(organizationId);
}

export async function upsertOrganizationEmailConfig(
  organizationId: string,
  input: OrganizationEmailConfigInput,
): Promise<OrganizationEmailConfigRecord> {
  const current = await getOrganizationEmailConfig(organizationId);
  const nextMailboxEmails =
    input.mailboxEmails !== undefined
      ? normalizeMailboxEmails(input.mailboxEmails)
      : current.mailboxEmails;
  const nextOutboundWebhookUrl =
    input.outboundWebhookUrl === undefined
      ? current.outboundWebhookUrl
      : input.outboundWebhookUrl?.trim() || null;
  const nextSyncEnabled = input.syncEnabled ?? current.syncEnabled;

  let encryptedWebhookSecret: string | null | undefined;
  let hasWebhookSecret = current.hasWebhookSecret;

  if (input.webhookSecret === "") {
    encryptedWebhookSecret = null;
    hasWebhookSecret = false;
  } else if (input.webhookSecret?.trim()) {
    encryptedWebhookSecret = encryptCredentials({
      secret: input.webhookSecret.trim(),
    });
    hasWebhookSecret = true;
  }

  const updated: OrganizationEmailConfigRecord = {
    organizationId,
    syncEnabled: nextSyncEnabled,
    outboundWebhookUrl: nextOutboundWebhookUrl,
    mailboxEmails: nextMailboxEmails,
    hasWebhookSecret,
    lastSyncAt: current.lastSyncAt,
    lastSyncStatus: current.lastSyncStatus,
    lastSyncError: current.lastSyncError,
  };

  if (!isDatabaseConfigured()) {
    getMemoryStore().set(organizationId, updated);
    return updated;
  }

  const prisma = getPrismaClient();
  const record = await prisma.organizationEmailConfig.upsert({
    where: { organizationId },
    create: {
      organizationId,
      syncEnabled: nextSyncEnabled,
      outboundWebhookUrl: nextOutboundWebhookUrl,
      mailboxEmails: nextMailboxEmails,
      ...(encryptedWebhookSecret !== undefined
        ? { encryptedWebhookSecret }
        : {}),
    },
    update: {
      syncEnabled: nextSyncEnabled,
      outboundWebhookUrl: nextOutboundWebhookUrl,
      mailboxEmails: nextMailboxEmails,
      ...(encryptedWebhookSecret !== undefined
        ? { encryptedWebhookSecret }
        : {}),
    },
  });

  return mapEmailConfigRow(record);
}

export async function resolveOutboundWebhookUrl(
  organizationId: string,
): Promise<string | null> {
  const scopedOrganizationId = resolveClauseLibraryOrganizationId(organizationId);
  const config = await getOrganizationEmailConfig(scopedOrganizationId);
  const orgUrl = config.outboundWebhookUrl?.trim();

  if (orgUrl) {
    return orgUrl;
  }

  const globalUrl = process.env.CONTRACT_EMAIL_WEBHOOK_URL?.trim();

  if (!globalUrl) {
    return null;
  }

  if (scopedOrganizationId === DEFAULT_ORGANIZATION_ID) {
    return globalUrl;
  }

  return null;
}

export async function isOrganizationWebhookAuthorized(
  organizationId: string,
  request: Request,
): Promise<boolean> {
  const scopedOrganizationId = resolveClauseLibraryOrganizationId(organizationId);
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const headerSecret = request.headers.get("x-contract-email-secret")?.trim() ?? "";
  const providedSecret = bearerToken || headerSecret;

  if (!providedSecret) {
    return false;
  }

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      const record = await prisma.organizationEmailConfig.findUnique({
        where: { organizationId: scopedOrganizationId },
        select: { encryptedWebhookSecret: true },
      });

      if (record?.encryptedWebhookSecret) {
        const credentials = decryptCredentials(record.encryptedWebhookSecret) as Record<
          string,
          string
        >;
        const orgSecret = credentials.secret?.trim();

        return Boolean(orgSecret && orgSecret === providedSecret);
      }
    } catch {
      return false;
    }
  }

  if (scopedOrganizationId !== DEFAULT_ORGANIZATION_ID) {
    return false;
  }

  const configuredSecret =
    process.env.CONTRACT_EMAIL_WEBHOOK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();

  return Boolean(configuredSecret && configuredSecret === providedSecret);
}

export function isOrganizationEmailSyncEnabled(
  config: OrganizationEmailConfigRecord,
): boolean {
  const globalFlag = process.env.CONTRACT_EMAIL_SYNC_ENABLED?.trim().toLowerCase();

  if (globalFlag === "false" || globalFlag === "0") {
    return false;
  }

  return config.syncEnabled;
}

export async function recordOrganizationEmailSyncResult(
  organizationId: string,
  input: {
    success: boolean;
    error?: string | null;
  },
): Promise<void> {
  const timestamp = new Date();

  if (!isDatabaseConfigured()) {
    const current =
      getMemoryStore().get(organizationId) ?? buildDefaultConfig(organizationId);
    getMemoryStore().set(organizationId, {
      ...current,
      lastSyncAt: timestamp.toISOString(),
      lastSyncStatus: input.success ? "success" : "failed",
      lastSyncError: input.success ? null : input.error ?? "Unknown error.",
    });
    return;
  }

  const prisma = getPrismaClient();
  await prisma.organizationEmailConfig.upsert({
    where: { organizationId },
    create: {
      organizationId,
      lastSyncAt: timestamp,
      lastSyncStatus: input.success ? "success" : "failed",
      lastSyncError: input.success ? null : input.error ?? "Unknown error.",
    },
    update: {
      lastSyncAt: timestamp,
      lastSyncStatus: input.success ? "success" : "failed",
      lastSyncError: input.success ? null : input.error ?? "Unknown error.",
    },
  });
}

export async function listOrganizationsWithEmailSyncEnabled(): Promise<string[]> {
  const organizations: string[] = [];

  for (const organizationId of getAllowedOrganizationIds()) {
    const [emailConfig, directoryConfig] = await Promise.all([
      getOrganizationEmailConfig(organizationId),
      getDirectoryConfig(organizationId),
    ]);

    if (!isOrganizationEmailSyncEnabled(emailConfig)) {
      continue;
    }

    if (!directoryConfig?.isEnabled || directoryConfig.provider !== "microsoft") {
      continue;
    }

    organizations.push(organizationId);
  }

  return organizations;
}

export async function getLegalMailboxEmailsForOrganization(
  organizationId: string,
): Promise<string[]> {
  const config = await getOrganizationEmailConfig(organizationId);

  if (config.mailboxEmails.length > 0) {
    return [...new Set(config.mailboxEmails)];
  }

  if (!isDatabaseConfigured()) {
    return [];
  }

  const prisma = getPrismaClient();
  const directoryUsers = await prisma.directoryUser.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: {
      email: true,
      department: true,
      jobTitle: true,
    },
  });

  if (directoryUsers.length === 0) {
    return [];
  }

  const legalDepartmentUsers = directoryUsers.filter(
    (user) =>
      /legal/i.test(user.department ?? "") || /legal/i.test(user.jobTitle ?? ""),
  );

  if (legalDepartmentUsers.length > 0) {
    return [...new Set(legalDepartmentUsers.map((user) => user.email.trim()).filter(Boolean))];
  }

  return [];
}
