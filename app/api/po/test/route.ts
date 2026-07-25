import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import type { PoAuthType, PoProvider } from "@/lib/generated/prisma/enums";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail } from "@/lib/legal-access";
import { testPoLookup } from "@/lib/po-integration";

interface PoTestRequestBody {
  poNumber?: string;
  provider?: PoProvider;
  displayName?: string;
  baseUrl?: string | null;
  authType?: PoAuthType;
  credentials?: Record<string, string>;
  fieldMappings?: Record<string, string>;
  useSavedConfig?: boolean;
  useStoredCredentials?: boolean;
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

export async function POST(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!actorEmail || !isAdminEmail(actorEmail)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: PoTestRequestBody;

  try {
    body = (await request.json()) as PoTestRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const poNumber = body.poNumber?.trim() ?? "";

  if (poNumber.length < 2) {
    return NextResponse.json(
      { error: "Enter a PO number with at least 2 characters." },
      { status: 400 },
    );
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();

    if (body.useSavedConfig) {
      const result = await testPoLookup(poNumber, organizationId, actorEmail);
      return NextResponse.json({ success: true, result });
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

    const result = await testPoLookup(poNumber, organizationId, actorEmail, {
      provider: body.provider,
      displayName: body.displayName.trim(),
      baseUrl: body.baseUrl?.trim() || null,
      authType: body.authType,
      credentials: body.credentials ?? undefined,
      fieldMappings: body.fieldMappings ?? undefined,
      useStoredCredentials: body.useStoredCredentials ?? false,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    reportError(error, { route: "POST /api/po/test", poNumber });

    const message =
      error instanceof Error ? error.message : "PO connection test failed.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
