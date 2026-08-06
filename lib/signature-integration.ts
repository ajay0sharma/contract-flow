import type { Prisma, SignatureIntegrationConfig } from "@/lib/generated/prisma/client";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import { decryptCredentials, encryptCredentials } from "@/lib/po-integration";
import type {
  SignatureIntegrationConfigInput,
  SignatureIntegrationConfigRecord,
} from "@/types/signature-integration";

const globalSignatureConfigStore = globalThis as typeof globalThis & {
  __signatureIntegrationConfigStore?: Map<string, SignatureIntegrationConfigRecord>;
  __signatureCredentialsStore?: Map<string, Record<string, string>>;
  __signatureWebhookSecretStore?: Map<string, string>;
};

function getMemoryStore(): Map<string, SignatureIntegrationConfigRecord> {
  if (!globalSignatureConfigStore.__signatureIntegrationConfigStore) {
    globalSignatureConfigStore.__signatureIntegrationConfigStore = new Map();
  }

  return globalSignatureConfigStore.__signatureIntegrationConfigStore;
}

function toJsonValue(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (value == null) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseSettings(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function buildDefaultConfig(
  organizationId: string,
): SignatureIntegrationConfigRecord {
  return {
    organizationId,
    provider: "manual",
    isEnabled: false,
    displayName: "Manual signature",
    accountId: null,
    baseUrl: null,
    hasStoredCredentials: false,
    hasWebhookSecret: false,
    autoActivateOnComplete: true,
    reminderDays: 3,
    settings: null,
    lastTestAt: null,
    lastTestStatus: null,
    lastTestError: null,
  };
}

function mapConfigRow(
  row: SignatureIntegrationConfig,
): SignatureIntegrationConfigRecord {
  return {
    organizationId: row.organizationId,
    provider: row.provider,
    isEnabled: row.isEnabled,
    displayName: row.displayName,
    accountId: row.accountId,
    baseUrl: row.baseUrl,
    hasStoredCredentials: Boolean(row.encryptedCredentials?.trim()),
    hasWebhookSecret: Boolean(row.encryptedWebhookSecret?.trim()),
    autoActivateOnComplete: row.autoActivateOnComplete,
    reminderDays: row.reminderDays,
    settings: parseSettings(row.settings),
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
    lastTestStatus: row.lastTestStatus,
    lastTestError: row.lastTestError,
  };
}

export function toPublicSignatureConfig(
  config: SignatureIntegrationConfigRecord,
): SignatureIntegrationConfigRecord {
  return config;
}

export async function getSignatureIntegrationConfig(
  organizationId?: string,
): Promise<SignatureIntegrationConfigRecord> {
  const scopedOrganizationId = resolveClauseLibraryOrganizationId(organizationId);

  if (allowMemoryPersistence() || !isDatabaseConfigured()) {
    return (
      getMemoryStore().get(scopedOrganizationId) ??
      buildDefaultConfig(scopedOrganizationId)
    );
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.signatureIntegrationConfig.findUnique({
      where: { organizationId: scopedOrganizationId },
    });

    if (!row) {
      return buildDefaultConfig(scopedOrganizationId);
    }

    return mapConfigRow(row);
  } catch {
    return (
      getMemoryStore().get(scopedOrganizationId) ??
      buildDefaultConfig(scopedOrganizationId)
    );
  }
}

export async function getSignatureConfigCredentials(
  organizationId: string,
): Promise<Record<string, string>> {
  if (allowMemoryPersistence() || !isDatabaseConfigured()) {
    if (!getMemoryStore().get(organizationId)?.hasStoredCredentials) {
      return {};
    }

    return globalSignatureConfigStore.__signatureCredentialsStore?.get(
      organizationId,
    ) ?? {};
  }

  const prisma = getPrismaClient();
  const row = await prisma.signatureIntegrationConfig.findUnique({
    where: { organizationId },
  });

  if (!row?.encryptedCredentials) {
    return {};
  }

  return decryptCredentials(row.encryptedCredentials);
}

export async function getSignatureWebhookSecret(
  organizationId: string,
): Promise<string | null> {
  if (allowMemoryPersistence() || !isDatabaseConfigured()) {
    return (
      globalSignatureConfigStore.__signatureWebhookSecretStore?.get(
        organizationId,
      ) ?? null
    );
  }

  const prisma = getPrismaClient();
  const row = await prisma.signatureIntegrationConfig.findUnique({
    where: { organizationId },
  });

  if (!row?.encryptedWebhookSecret) {
    return null;
  }

  return decryptCredentials(row.encryptedWebhookSecret).secret ?? null;
}

export async function isSignatureWebhookAuthorized(
  organizationId: string,
  providedSecret: string | null | undefined,
): Promise<boolean> {
  const secret = await getSignatureWebhookSecret(organizationId);

  if (!secret?.trim()) {
    return false;
  }

  return secret.trim() === providedSecret?.trim();
}

function hasNonEmptyCredentialValues(
  credentials: Record<string, string>,
): boolean {
  return Object.values(credentials).some((value) => value.trim().length > 0);
}

export async function upsertSignatureIntegrationConfig(
  organizationId: string,
  input: SignatureIntegrationConfigInput,
): Promise<SignatureIntegrationConfigRecord> {
  const existing = await getSignatureIntegrationConfig(organizationId);
  const credentialsUpdate =
    input.credentials &&
    typeof input.credentials === "object" &&
    hasNonEmptyCredentialValues(input.credentials)
      ? input.credentials
      : null;

  const next: SignatureIntegrationConfigRecord = {
    organizationId,
    provider: input.provider ?? existing.provider,
    isEnabled: input.isEnabled ?? existing.isEnabled,
    displayName: input.displayName?.trim() || existing.displayName,
    accountId:
      input.accountId !== undefined ? input.accountId : existing.accountId,
    baseUrl: input.baseUrl !== undefined ? input.baseUrl : existing.baseUrl,
    hasStoredCredentials:
      credentialsUpdate !== null ? true : existing.hasStoredCredentials,
    hasWebhookSecret: input.webhookSecret?.trim()
      ? true
      : input.webhookSecret === null
        ? false
        : existing.hasWebhookSecret,
    autoActivateOnComplete:
      input.autoActivateOnComplete ?? existing.autoActivateOnComplete,
    reminderDays: input.reminderDays ?? existing.reminderDays,
    settings:
      input.settings !== undefined ? input.settings : existing.settings,
    lastTestAt: existing.lastTestAt,
    lastTestStatus: existing.lastTestStatus,
    lastTestError: existing.lastTestError,
  };

  if (allowMemoryPersistence() || !isDatabaseConfigured()) {
    getMemoryStore().set(organizationId, next);

    if (credentialsUpdate) {
      if (!globalSignatureConfigStore.__signatureCredentialsStore) {
        globalSignatureConfigStore.__signatureCredentialsStore = new Map();
      }

      globalSignatureConfigStore.__signatureCredentialsStore.set(
        organizationId,
        credentialsUpdate,
      );
    }

    if (input.webhookSecret?.trim()) {
      if (!globalSignatureConfigStore.__signatureWebhookSecretStore) {
        globalSignatureConfigStore.__signatureWebhookSecretStore = new Map();
      }

      globalSignatureConfigStore.__signatureWebhookSecretStore.set(
        organizationId,
        input.webhookSecret.trim(),
      );
    }

    return next;
  }

  const prisma = getPrismaClient();
  const current = await prisma.signatureIntegrationConfig.findUnique({
    where: { organizationId },
  });

  const encryptedCredentials = credentialsUpdate
    ? encryptCredentials(credentialsUpdate)
    : current?.encryptedCredentials ?? null;

  let encryptedWebhookSecret = current?.encryptedWebhookSecret ?? null;

  if (input.webhookSecret?.trim()) {
    encryptedWebhookSecret = encryptCredentials({
      secret: input.webhookSecret.trim(),
    });
  } else if (input.webhookSecret === null) {
    encryptedWebhookSecret = null;
  }

  const row = await prisma.signatureIntegrationConfig.upsert({
    where: { organizationId },
    create: {
      organizationId,
      provider: next.provider,
      isEnabled: next.isEnabled,
      displayName: next.displayName,
      accountId: next.accountId,
      baseUrl: next.baseUrl,
      encryptedCredentials,
      encryptedWebhookSecret,
      autoActivateOnComplete: next.autoActivateOnComplete,
      reminderDays: next.reminderDays,
      settings: toJsonValue(next.settings),
    },
    update: {
      provider: next.provider,
      isEnabled: next.isEnabled,
      displayName: next.displayName,
      accountId: next.accountId,
      baseUrl: next.baseUrl,
      ...(credentialsUpdate ? { encryptedCredentials } : {}),
      encryptedWebhookSecret,
      autoActivateOnComplete: next.autoActivateOnComplete,
      reminderDays: next.reminderDays,
      settings: toJsonValue(next.settings),
    },
  });

  return mapConfigRow(row);
}

export async function recordSignatureIntegrationTestResult(
  organizationId: string,
  result: { success: boolean; message: string; error?: string | null },
): Promise<void> {
  const status = result.success ? "success" : "failed";
  const error = result.success ? null : result.error ?? result.message;

  if (allowMemoryPersistence() || !isDatabaseConfigured()) {
    const existing = await getSignatureIntegrationConfig(organizationId);
    getMemoryStore().set(organizationId, {
      ...existing,
      lastTestAt: new Date().toISOString(),
      lastTestStatus: status,
      lastTestError: error,
    });
    return;
  }

  const prisma = getPrismaClient();
  await prisma.signatureIntegrationConfig.updateMany({
    where: { organizationId },
    data: {
      lastTestAt: new Date(),
      lastTestStatus: status,
      lastTestError: error,
    },
  });
}
