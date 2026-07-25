import { NextRequest, NextResponse } from "next/server";
import type { DirectoryProvider } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { getDirectoryConfig } from "@/lib/directory-sync";
import {
  DIRECTORY_PROVIDERS,
  isRecord,
  requireAdminActor,
  toPublicDirectoryConfig,
} from "@/lib/directory-route-utils";
import { reportError } from "@/lib/error-reporting";
import { encryptCredentials } from "@/lib/po-integration";
import { getPrismaClient } from "@/lib/prisma";

interface DirectoryConfigUpdateBody {
  provider?: DirectoryProvider;
  displayName?: string;
  credentials?: Record<string, string> | null;
  autoSyncEnabled?: boolean;
  autoSyncIntervalHours?: number;
  scopeFilter?: Prisma.InputJsonValue | null;
  isEnabled?: boolean;
}

export async function GET() {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const config = await getDirectoryConfig(organizationId);

    if (!config) {
      return NextResponse.json({ configured: false });
    }

    return NextResponse.json(toPublicDirectoryConfig(config));
  } catch (error) {
    reportError(error, { route: "GET /api/directory/config" });
    return NextResponse.json(
      { error: "Failed to load directory configuration." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  const { actorEmail, actorName } = auth;

  let body: DirectoryConfigUpdateBody;

  try {
    body = (await request.json()) as DirectoryConfigUpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.provider || !DIRECTORY_PROVIDERS.has(body.provider)) {
    return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
  }

  if (!body.displayName?.trim()) {
    return NextResponse.json(
      { error: "displayName is required." },
      { status: 400 },
    );
  }

  if (
    body.credentials !== undefined &&
    body.credentials !== null &&
    !isRecord(body.credentials)
  ) {
    return NextResponse.json(
      { error: "credentials must be an object of string values." },
      { status: 400 },
    );
  }

  if (
    body.autoSyncIntervalHours != null &&
    (!Number.isInteger(body.autoSyncIntervalHours) ||
      body.autoSyncIntervalHours < 1)
  ) {
    return NextResponse.json(
      { error: "autoSyncIntervalHours must be a positive integer." },
      { status: 400 },
    );
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const prisma = getPrismaClient();
    const existing = await prisma.directoryIntegrationConfig.findUnique({
      where: { organizationId },
    });

    if (
      !existing &&
      (!body.credentials || Object.keys(body.credentials).length === 0)
    ) {
      return NextResponse.json(
        { error: "credentials are required when creating directory config." },
        { status: 400 },
      );
    }

    const encryptedCredentials =
      body.credentials && Object.keys(body.credentials).length > 0
        ? encryptCredentials(body.credentials)
        : existing?.encryptedCredentials ?? encryptCredentials({});

    const record = await prisma.directoryIntegrationConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        provider: body.provider,
        displayName: body.displayName.trim(),
        encryptedCredentials,
        autoSyncEnabled: body.autoSyncEnabled ?? true,
        autoSyncIntervalHours: body.autoSyncIntervalHours ?? 24,
        scopeFilter: body.scopeFilter ?? undefined,
        isEnabled: body.isEnabled ?? false,
      },
      update: {
        provider: body.provider,
        displayName: body.displayName.trim(),
        ...(body.credentials !== undefined && body.credentials !== null
          ? { encryptedCredentials }
          : {}),
        autoSyncEnabled: body.autoSyncEnabled ?? true,
        autoSyncIntervalHours: body.autoSyncIntervalHours ?? 24,
        scopeFilter: body.scopeFilter ?? undefined,
        isEnabled: body.isEnabled ?? false,
      },
    });

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: organizationId,
      action: "directory_config_updated",
      actorEmail,
      actorName,
      detail: `Updated directory integration config for ${record.displayName} (${record.provider}).`,
      metadata: {
        provider: record.provider,
        isEnabled: record.isEnabled,
        autoSyncEnabled: record.autoSyncEnabled,
      },
    });

    return NextResponse.json(toPublicDirectoryConfig(record));
  } catch (error) {
    reportError(error, { route: "PUT /api/directory/config" });
    return NextResponse.json(
      { error: "Failed to update directory configuration." },
      { status: 500 },
    );
  }
}
