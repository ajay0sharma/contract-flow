import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { syncDirectoryUsers } from "@/lib/directory-sync";
import { reportError } from "@/lib/error-reporting";
import { getPrismaClient } from "@/lib/prisma";

const CRON_ACTOR_EMAIL = "system@directory-sync";
const CRON_ACTOR_NAME = "Directory Sync Cron";

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";

  return authorization === `Bearer ${cronSecret}`;
}

function isConfigDueForSync(
  lastSyncAt: Date | null,
  autoSyncIntervalHours: number,
  nowMs: number,
): boolean {
  if (!lastSyncAt) {
    return true;
  }

  const intervalMs = autoSyncIntervalHours * 60 * 60 * 1000;
  return lastSyncAt.getTime() + intervalMs <= nowMs;
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const prisma = getPrismaClient();
    const configs = await prisma.directoryIntegrationConfig.findMany({
      where: {
        isEnabled: true,
        autoSyncEnabled: true,
        provider: {
          not: "manual",
        },
      },
    });

    const nowMs = Date.now();
    const dueConfigs = configs.filter((config) =>
      isConfigDueForSync(
        config.lastSyncAt,
        config.autoSyncIntervalHours,
        nowMs,
      ),
    );

    const results: Array<{
      organizationId: string;
      success: boolean;
      usersAdded: number;
      usersUpdated: number;
      usersDeactivated: number;
      totalUsers: number;
      error: string | null;
    }> = [];

    for (const config of dueConfigs) {
      const result = await syncDirectoryUsers(config.organizationId);

      results.push({
        organizationId: config.organizationId,
        ...result,
      });

      await writeAuditLog({
        organizationId: config.organizationId,
        entityType: "contract",
        entityId: config.organizationId,
        action: "directory_synced",
        actorEmail: CRON_ACTOR_EMAIL,
        actorName: CRON_ACTOR_NAME,
        detail: result.success
          ? `Scheduled directory sync completed with ${result.totalUsers} users.`
          : `Scheduled directory sync failed: ${result.error ?? "Unknown error."}`,
        metadata: {
          trigger: "cron",
          ...result,
        },
      });
    }

    return NextResponse.json({
      checked: configs.length,
      synced: dueConfigs.length,
      results,
    });
  } catch (error) {
    reportError(error, { route: "POST /api/cron/directory-sync" });
    return NextResponse.json(
      { error: "Failed to run scheduled directory sync." },
      { status: 500 },
    );
  }
}
