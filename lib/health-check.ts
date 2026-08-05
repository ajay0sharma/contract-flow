import { isDatabaseConfigured } from "@/lib/persistence-mode";
import { getPrismaClient } from "@/lib/prisma";

export type HealthCheckStatus = "ok" | "degraded";

export interface HealthCheckResult {
  status: HealthCheckStatus;
  timestamp: string;
  version: string;
  environment: string;
  checks: {
    database: {
      status: "ok" | "error" | "skipped";
      message?: string;
    };
  };
}

export async function runHealthChecks(): Promise<{
  result: HealthCheckResult;
  httpStatus: number;
}> {
  const checks: HealthCheckResult["checks"] = {
    database: { status: "skipped" },
  };

  if (isDatabaseConfigured()) {
    try {
      const prisma = getPrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: "ok" };
    } catch (error) {
      checks.database = {
        status: "error",
        message:
          error instanceof Error ? error.message : "Database check failed.",
      };
    }
  }

  const status: HealthCheckStatus =
    checks.database.status === "error" ? "degraded" : "ok";

  return {
    result: {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.0.0",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      checks,
    },
    httpStatus: status === "ok" ? 200 : 503,
  };
}
