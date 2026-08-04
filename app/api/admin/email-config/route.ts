import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveRequestedOrganizationId } from "@/lib/contract-email-org";
import {
  getOrganizationEmailConfig,
  upsertOrganizationEmailConfig,
} from "@/lib/organization-email-config";
import { reportError } from "@/lib/error-reporting";
import { requireAdminActor } from "@/lib/directory-route-utils";

interface EmailConfigUpdateBody {
  organizationId?: string;
  syncEnabled?: boolean;
  outboundWebhookUrl?: string | null;
  webhookSecret?: string | null;
  mailboxEmails?: string[];
}

function toPublicEmailConfig(
  config: Awaited<ReturnType<typeof getOrganizationEmailConfig>>,
) {
  return {
    organizationId: config.organizationId,
    syncEnabled: config.syncEnabled,
    outboundWebhookUrl: config.outboundWebhookUrl,
    mailboxEmails: config.mailboxEmails,
    hasWebhookSecret: config.hasWebhookSecret,
    lastSyncAt: config.lastSyncAt,
    lastSyncStatus: config.lastSyncStatus,
    lastSyncError: config.lastSyncError,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const organizationId = resolveRequestedOrganizationId(
      request.nextUrl.searchParams.get("organizationId"),
    );
    const config = await getOrganizationEmailConfig(organizationId);

    return NextResponse.json(toPublicEmailConfig(config));
  } catch (error) {
    reportError(error, { route: "GET /api/admin/email-config" });
    return NextResponse.json(
      { error: "Failed to load client email configuration." },
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

  let body: EmailConfigUpdateBody;

  try {
    body = (await request.json()) as EmailConfigUpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.mailboxEmails && !Array.isArray(body.mailboxEmails)) {
    return NextResponse.json(
      { error: "mailboxEmails must be an array of email addresses." },
      { status: 400 },
    );
  }

  try {
    const organizationId = resolveRequestedOrganizationId(
      body.organizationId ?? request.nextUrl.searchParams.get("organizationId"),
    );
    const updated = await upsertOrganizationEmailConfig(organizationId, {
      syncEnabled: body.syncEnabled,
      outboundWebhookUrl: body.outboundWebhookUrl,
      webhookSecret: body.webhookSecret,
      mailboxEmails: body.mailboxEmails,
    });

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: organizationId,
      action: "organization_email_config_updated",
      actorEmail,
      actorName,
      detail: `Updated email settings for client ${organizationId}.`,
      metadata: {
        syncEnabled: updated.syncEnabled,
        mailboxCount: updated.mailboxEmails.length,
        hasOutboundWebhook: Boolean(updated.outboundWebhookUrl),
        hasWebhookSecret: updated.hasWebhookSecret,
      },
    });

    return NextResponse.json(toPublicEmailConfig(updated));
  } catch (error) {
    reportError(error, { route: "PUT /api/admin/email-config" });
    return NextResponse.json(
      { error: "Failed to update client email configuration." },
      { status: 500 },
    );
  }
}
