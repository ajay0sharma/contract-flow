import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { syncContractEmailsForAllOrganizations } from "@/lib/contract-email-sync";
import { reportError } from "@/lib/error-reporting";
import { isDatabaseConfigured } from "@/lib/prisma";

const CRON_ACTOR_EMAIL = "system@contract-email-sync";
const CRON_ACTOR_NAME = "Contract Email Sync Cron";

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";

  return authorization === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Database is required for contract email sync." },
      { status: 503 },
    );
  }

  try {
    const summary = await syncContractEmailsForAllOrganizations();

    for (const result of summary.results) {
      await writeAuditLog({
        organizationId: result.organizationId,
        entityType: "contract",
        entityId: result.organizationId,
        action: "contract_email_synced",
        actorEmail: CRON_ACTOR_EMAIL,
        actorName: CRON_ACTOR_NAME,
        detail: result.success
          ? `Captured ${result.messagesCaptured} contract emails from ${result.mailboxesChecked} mailbox(es).`
          : `Contract email sync completed with errors: ${result.errors.join(" ")}`,
        metadata: {
          trigger: "cron",
          ...result,
        },
      });
    }

    return NextResponse.json(summary, {
      status: summary.results.every((result) => result.success) ? 200 : 207,
    });
  } catch (error) {
    reportError(error, { route: "POST /api/cron/contract-email-sync" });
    return NextResponse.json(
      { error: "Failed to run scheduled contract email sync." },
      { status: 500 },
    );
  }
}
