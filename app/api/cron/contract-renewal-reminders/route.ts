import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { reportError } from "@/lib/error-reporting";
import { processRenewalRemindersForAllOrganizations } from "@/lib/renewal-service";

const CRON_ACTOR_EMAIL = "system@renewal-reminders";
const CRON_ACTOR_NAME = "Renewal Reminder Cron";

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

  try {
    const results = await processRenewalRemindersForAllOrganizations();

    for (const result of results) {
      if (result.sent === 0 && result.autoExpired === 0) {
        continue;
      }

      await writeAuditLog({
        organizationId: result.organizationId,
        entityType: "contract",
        entityId: result.organizationId,
        action: "renewal_reminders_processed",
        actorEmail: CRON_ACTOR_EMAIL,
        actorName: CRON_ACTOR_NAME,
        detail: `Processed ${result.candidates} renewal reminder candidate(s).`,
        metadata: {
          trigger: "cron",
          ...result,
        },
      });
    }

    return NextResponse.json({
      organizations: results.length,
      results,
    });
  } catch (error) {
    reportError(error, { route: "POST /api/cron/contract-renewal-reminders" });
    return NextResponse.json(
      { error: "Failed to process renewal reminders." },
      { status: 500 },
    );
  }
}
