import { fetchGoogleUsers, type GoogleCredentials } from "@/lib/directory-google";
import {
  fetchMicrosoftUsers,
  type MicrosoftCredentials,
  type MicrosoftScopeFilter,
} from "@/lib/directory-microsoft";
import type { DirectoryUserData } from "@/lib/directory-types";
import { reportError } from "@/lib/error-reporting";
import { decryptCredentials } from "@/lib/po-integration";
import { getPrismaClient } from "@/lib/prisma";
import type {
  DirectoryIntegrationConfig,
  DirectoryProvider,
  DirectoryUser,
} from "@/lib/generated/prisma/client";

export type { DirectoryIntegrationConfig, DirectoryUser };

type DirectoryScopeFilter = {
  departments?: string[];
  groups?: string[];
  domain?: string;
};

type SyncResult = {
  success: boolean;
  usersAdded: number;
  usersUpdated: number;
  usersDeactivated: number;
  totalUsers: number;
  error: string | null;
};

const EMPTY_SYNC_RESULT: SyncResult = {
  success: false,
  usersAdded: 0,
  usersUpdated: 0,
  usersDeactivated: 0,
  totalUsers: 0,
  error: null,
};

function parseScopeFilter(value: unknown): DirectoryScopeFilter | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const filter = value as Record<string, unknown>;

  return {
    departments: Array.isArray(filter.departments)
      ? filter.departments.map((entry) => String(entry))
      : undefined,
    groups: Array.isArray(filter.groups)
      ? filter.groups.map((entry) => String(entry))
      : undefined,
    domain:
      typeof filter.domain === "string" && filter.domain.trim()
        ? filter.domain.trim()
        : undefined,
  };
}

function toMicrosoftCredentials(
  credentials: Record<string, string>,
): MicrosoftCredentials {
  return {
    tenantId: credentials.tenantId ?? "",
    clientId: credentials.clientId ?? "",
    clientSecret: credentials.clientSecret ?? "",
  };
}

function toGoogleCredentials(
  credentials: Record<string, string>,
): GoogleCredentials {
  return {
    serviceAccountJson: credentials.serviceAccountJson ?? "",
    adminEmail: credentials.adminEmail ?? "",
    domain: credentials.domain ?? "",
  };
}

async function fetchProviderUsers(
  provider: DirectoryProvider,
  credentials: Record<string, string>,
  scopeFilter?: DirectoryScopeFilter,
): Promise<DirectoryUserData[]> {
  if (provider === "microsoft") {
    return fetchMicrosoftUsers(
      toMicrosoftCredentials(credentials),
      scopeFilter as MicrosoftScopeFilter,
    );
  }

  if (provider === "google") {
    return fetchGoogleUsers(toGoogleCredentials(credentials), scopeFilter);
  }

  throw new Error("Manual provider does not support sync");
}

function buildDirectoryUserData(
  organizationId: string,
  provider: DirectoryProvider,
  user: DirectoryUserData,
  syncedAt: Date,
) {
  return {
    organizationId,
    externalId: user.externalId,
    email: user.email,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    jobTitle: user.jobTitle,
    department: user.department,
    officeLocation: user.officeLocation,
    phone: user.phone,
    managerEmail: user.managerEmail,
    isActive: user.isActive,
    provider,
    lastSeenAt: syncedAt,
  };
}

async function markSyncFailed(
  configId: string,
  errorMessage: string,
): Promise<void> {
  const prisma = getPrismaClient();

  await prisma.directoryIntegrationConfig.update({
    where: { id: configId },
    data: {
      lastSyncStatus: "failed",
      lastSyncError: errorMessage,
    },
  });
}

export async function getDirectoryConfig(
  organizationId: string,
): Promise<DirectoryIntegrationConfig | null> {
  const prisma = getPrismaClient();

  return prisma.directoryIntegrationConfig.findUnique({
    where: { organizationId },
  });
}

export async function syncDirectoryUsers(
  organizationId: string,
): Promise<SyncResult> {
  const config = await getDirectoryConfig(organizationId);

  if (!config) {
    return {
      ...EMPTY_SYNC_RESULT,
      error: "Directory integration is not configured for this organization.",
    };
  }

  if (!config.isEnabled) {
    return {
      ...EMPTY_SYNC_RESULT,
      error: "Directory integration is disabled.",
    };
  }

  const prisma = getPrismaClient();

  await prisma.directoryIntegrationConfig.update({
    where: { id: config.id },
    data: {
      lastSyncStatus: "syncing",
      lastSyncError: null,
    },
  });

  try {
    if (config.provider === "manual") {
      throw new Error("Manual provider does not support sync");
    }

    const credentials = decryptCredentials(config.encryptedCredentials);
    const scopeFilter = parseScopeFilter(config.scopeFilter);
    const syncedUsers = await fetchProviderUsers(
      config.provider,
      credentials,
      scopeFilter,
    );
    const syncedAt = new Date();

    const existingUsers = await prisma.directoryUser.findMany({
      where: { organizationId },
      select: { externalId: true },
    });
    const existingExternalIds = new Set(
      existingUsers.map((user) => user.externalId),
    );

    let usersAdded = 0;
    let usersUpdated = 0;

    for (const user of syncedUsers) {
      const userData = buildDirectoryUserData(
        organizationId,
        config.provider,
        user,
        syncedAt,
      );

      if (existingExternalIds.has(user.externalId)) {
        await prisma.directoryUser.update({
          where: {
            organizationId_externalId: {
              organizationId,
              externalId: user.externalId,
            },
          },
          data: userData,
        });
        usersUpdated += 1;
      } else {
        await prisma.directoryUser.create({
          data: userData,
        });
        usersAdded += 1;
        existingExternalIds.add(user.externalId);
      }
    }

    const syncedExternalIds = syncedUsers.map((user) => user.externalId);
    const deactivationResult = await prisma.directoryUser.updateMany({
      where: {
        organizationId,
        isActive: true,
        externalId: {
          notIn: syncedExternalIds,
        },
      },
      data: {
        isActive: false,
      },
    });

    await prisma.directoryIntegrationConfig.update({
      where: { id: config.id },
      data: {
        lastSyncAt: syncedAt,
        lastSyncStatus: "success",
        lastSyncCount: syncedUsers.length,
        lastSyncError: null,
      },
    });

    return {
      success: true,
      usersAdded,
      usersUpdated,
      usersDeactivated: deactivationResult.count,
      totalUsers: syncedUsers.length,
      error: null,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Directory sync failed.";

    reportError(error, {
      scope: "syncDirectoryUsers",
      organizationId,
      configId: config.id,
    });

    try {
      await markSyncFailed(config.id, errorMessage);
    } catch (updateError) {
      reportError(updateError, {
        scope: "syncDirectoryUsers.markSyncFailed",
        organizationId,
        configId: config.id,
      });
    }

    return {
      ...EMPTY_SYNC_RESULT,
      error: errorMessage,
    };
  }
}

export async function searchDirectoryUsers(
  organizationId: string,
  query: string,
  limit: number = 10,
): Promise<DirectoryUser[]> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  const prisma = getPrismaClient();

  return prisma.directoryUser.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [
        { displayName: { contains: trimmedQuery, mode: "insensitive" } },
        { email: { contains: trimmedQuery, mode: "insensitive" } },
        { department: { contains: trimmedQuery, mode: "insensitive" } },
        { jobTitle: { contains: trimmedQuery, mode: "insensitive" } },
      ],
    },
    orderBy: {
      displayName: "asc",
    },
    take: limit,
  });
}

export async function getDirectoryUserByEmail(
  organizationId: string,
  email: string,
): Promise<DirectoryUser | null> {
  const prisma = getPrismaClient();
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    return null;
  }

  return prisma.directoryUser.findUnique({
    where: {
      organizationId_email: {
        organizationId,
        email: normalizedEmail,
      },
    },
  });
}

export async function getAllDepartments(
  organizationId: string,
): Promise<string[]> {
  const prisma = getPrismaClient();
  const users = await prisma.directoryUser.findMany({
    where: {
      organizationId,
      isActive: true,
      department: {
        not: null,
      },
    },
    select: {
      department: true,
    },
    distinct: ["department"],
    orderBy: {
      department: "asc",
    },
  });

  return users
    .map((user) => user.department?.trim())
    .filter((department): department is string => Boolean(department));
}

export async function getAllUsers(
  organizationId: string,
  activeOnly: boolean = true,
): Promise<DirectoryUser[]> {
  const prisma = getPrismaClient();

  return prisma.directoryUser.findMany({
    where: {
      organizationId,
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: {
      displayName: "asc",
    },
  });
}
