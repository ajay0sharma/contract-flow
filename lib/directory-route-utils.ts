import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { DirectoryIntegrationConfig } from "@/lib/generated/prisma/client";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";

export function toPublicDirectoryConfig(config: DirectoryIntegrationConfig) {
  return {
    provider: config.provider,
    isEnabled: config.isEnabled,
    displayName: config.displayName,
    lastSyncAt: config.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: config.lastSyncStatus,
    lastSyncCount: config.lastSyncCount,
    lastSyncError: config.lastSyncError,
    autoSyncEnabled: config.autoSyncEnabled,
    autoSyncIntervalHours: config.autoSyncIntervalHours,
    scopeFilter: config.scopeFilter,
  };
}

export async function requireAuthenticatedActor(): Promise<
  | { actorEmail: string; actorName: string; isAdmin: boolean; isPrivileged: boolean }
  | { response: NextResponse }
> {
  const user = await currentUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const actorName = getUserDisplayName(user);

  if (!actorEmail) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  return {
    actorEmail,
    actorName,
    isAdmin: isAdminEmail(actorEmail),
    isPrivileged: isAdminEmail(actorEmail) || isLegalEmail(actorEmail),
  };
}

export async function requireAdminActor(): Promise<
  | { actorEmail: string; actorName: string }
  | { response: NextResponse }
> {
  const auth = await requireAuthenticatedActor();

  if ("response" in auth) {
    return auth;
  }

  if (!auth.isAdmin) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { actorEmail: auth.actorEmail, actorName: auth.actorName };
}

export async function requirePrivilegedActor(): Promise<
  | { actorEmail: string; actorName: string }
  | { response: NextResponse }
> {
  const auth = await requireAuthenticatedActor();

  if ("response" in auth) {
    return auth;
  }

  if (!auth.isPrivileged) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { actorEmail: auth.actorEmail, actorName: auth.actorName };
}

export function isRecord(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const DIRECTORY_PROVIDERS = new Set<string>([
  "microsoft",
  "google",
  "manual",
]);
