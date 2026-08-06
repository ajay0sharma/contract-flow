import { NextRequest, NextResponse } from "next/server";
import type { SignatureProvider } from "@/lib/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit-log";
import { requireAdminOrganizationActor } from "@/lib/admin-organization-api";
import { reportError } from "@/lib/error-reporting";
import {
  getSignatureIntegrationConfig,
  toPublicSignatureConfig,
  upsertSignatureIntegrationConfig,
} from "@/lib/signature-integration";
import type { SignatureIntegrationConfigInput } from "@/types/signature-integration";

const SIGNATURE_PROVIDERS = new Set<string>([
  "docusign",
  "dropbox_sign",
  "adobe_sign",
  "webhook_bridge",
  "manual",
]);

interface SignatureConfigUpdateBody extends SignatureIntegrationConfigInput {
  organizationId?: string;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminOrganizationActor(request);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const config = await getSignatureIntegrationConfig(auth.organizationId);
    return NextResponse.json(toPublicSignatureConfig(config));
  } catch (error) {
    reportError(error, { route: "GET /api/admin/signature-config" });
    return NextResponse.json(
      { error: "Failed to load e-signature configuration." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminOrganizationActor(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { actorEmail, actorName, organizationId } = auth;

  let body: SignatureConfigUpdateBody;

  try {
    body = (await request.json()) as SignatureConfigUpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.provider && !SIGNATURE_PROVIDERS.has(body.provider)) {
    return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
  }

  if (body.displayName !== undefined && !body.displayName.trim()) {
    return NextResponse.json(
      { error: "displayName is required." },
      { status: 400 },
    );
  }

  if (
    body.reminderDays != null &&
    (!Number.isInteger(body.reminderDays) || body.reminderDays < 0)
  ) {
    return NextResponse.json(
      { error: "reminderDays must be a non-negative integer." },
      { status: 400 },
    );
  }

  try {
    const updated = await upsertSignatureIntegrationConfig(organizationId, {
      provider: body.provider as SignatureProvider | undefined,
      isEnabled: body.isEnabled,
      displayName: body.displayName,
      accountId: body.accountId,
      baseUrl: body.baseUrl,
      credentials: body.credentials,
      webhookSecret: body.webhookSecret,
      autoActivateOnComplete: body.autoActivateOnComplete,
      reminderDays: body.reminderDays,
      settings: body.settings,
    });

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: organizationId,
      action: "signature_config_updated",
      actorEmail,
      actorName,
      detail: `Updated e-signature settings for client ${organizationId}.`,
      metadata: {
        provider: updated.provider,
        isEnabled: updated.isEnabled,
      },
    });

    return NextResponse.json(toPublicSignatureConfig(updated));
  } catch (error) {
    reportError(error, { route: "PUT /api/admin/signature-config" });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update e-signature configuration.",
      },
      { status: 500 },
    );
  }
}
