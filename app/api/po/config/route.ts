import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import type { PoAuthType, PoProvider } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail } from "@/lib/legal-access";
import {
  encryptCredentials,
  loadPoIntegrationConfig,
  toIntakePoConfig,
  toPublicPoConfig,
} from "@/lib/po-integration";
import { getPrismaClient } from "@/lib/prisma";
import { getUserDisplayName } from "@/lib/user-display-name";

interface PoConfigUpdateBody {
  provider?: PoProvider;
  displayName?: string;
  baseUrl?: string | null;
  authType?: PoAuthType;
  credentials?: Record<string, string> | null;
  fieldMappings?: Prisma.InputJsonValue | null;
  autoPopulateOnMatch?: boolean;
  requirePoNumber?: boolean;
  allowedContractTypes?: Prisma.InputJsonValue | null;
  isEnabled?: boolean;
}

const PO_PROVIDERS = new Set<string>([
  "coupa",
  "sap",
  "prendio",
  "netsuite",
  "oracle",
  "manual",
  "other",
]);

const PO_AUTH_TYPES = new Set<string>([
  "api_key",
  "oauth2",
  "basic_auth",
  "none",
]);

function isRecord(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function requireAuthenticatedActor(): Promise<
  | { actorEmail: string; actorName: string; isAdmin: boolean }
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
  };
}

async function requireAdminActor(): Promise<
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

export async function GET() {
  const auth = await requireAuthenticatedActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const config = await loadPoIntegrationConfig(organizationId);

    if (!config) {
      return NextResponse.json({ configured: false });
    }

    if (auth.isAdmin) {
      return NextResponse.json(toPublicPoConfig(config));
    }

    return NextResponse.json(toIntakePoConfig(config));
  } catch (error) {
    reportError(error, { route: "GET /api/po/config" });
    return NextResponse.json(
      { error: "Failed to load PO configuration." },
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

  let body: PoConfigUpdateBody;

  try {
    body = (await request.json()) as PoConfigUpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.provider || !PO_PROVIDERS.has(body.provider)) {
    return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
  }

  if (!body.displayName?.trim()) {
    return NextResponse.json(
      { error: "displayName is required." },
      { status: 400 },
    );
  }

  if (!body.authType || !PO_AUTH_TYPES.has(body.authType)) {
    return NextResponse.json({ error: "Invalid authType." }, { status: 400 });
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

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const prisma = getPrismaClient();
    const existing = await prisma.poIntegrationConfig.findUnique({
      where: { organizationId },
    });

    const encryptedCredentials =
      body.credentials && Object.keys(body.credentials).length > 0
        ? encryptCredentials(body.credentials)
        : existing?.encryptedCredentials ?? null;

    const record = await prisma.poIntegrationConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        provider: body.provider,
        displayName: body.displayName.trim(),
        baseUrl: body.baseUrl?.trim() || null,
        authType: body.authType,
        encryptedCredentials,
        fieldMappings: body.fieldMappings ?? undefined,
        autoPopulateOnMatch: body.autoPopulateOnMatch ?? true,
        requirePoNumber: body.requirePoNumber ?? false,
        allowedContractTypes: body.allowedContractTypes ?? undefined,
        isEnabled: body.isEnabled ?? false,
      },
      update: {
        provider: body.provider,
        displayName: body.displayName.trim(),
        baseUrl: body.baseUrl?.trim() || null,
        authType: body.authType,
        ...(body.credentials !== undefined && body.credentials !== null
          ? { encryptedCredentials }
          : {}),
        fieldMappings: body.fieldMappings ?? undefined,
        autoPopulateOnMatch: body.autoPopulateOnMatch ?? true,
        requirePoNumber: body.requirePoNumber ?? false,
        allowedContractTypes: body.allowedContractTypes ?? undefined,
        isEnabled: body.isEnabled ?? false,
      },
    });

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: organizationId,
      action: "po_config_updated",
      actorEmail,
      actorName,
      detail: `Updated PO integration config for ${record.displayName} (${record.provider}).`,
      metadata: {
        provider: record.provider,
        isEnabled: record.isEnabled,
      },
    });

    return NextResponse.json(toPublicPoConfig(record));
  } catch (error) {
    reportError(error, { route: "PUT /api/po/config" });
    return NextResponse.json(
      { error: "Failed to update PO configuration." },
      { status: 500 },
    );
  }
}
