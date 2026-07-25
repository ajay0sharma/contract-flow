import { NextResponse } from "next/server";
import { requireTemplateManager } from "@/lib/template-route-auth";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { getPrismaClient } from "@/lib/prisma";

export async function GET() {
  const auth = await requireTemplateManager();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();

  try {
    const prisma = getPrismaClient();
    const entries = await prisma.auditLog.findMany({
      where: {
        organizationId,
        entityType: "contract_template",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      entries: entries.map((entry) => ({
        id: entry.id,
        entityId: entry.entityId,
        action: entry.action,
        detail: entry.detail,
        actorEmail: entry.actorEmail,
        actorName: entry.actorName,
        metadata:
          entry.metadata && typeof entry.metadata === "object"
            ? entry.metadata
            : null,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    reportError(error, { route: "GET /api/audit/templates" });
    return NextResponse.json(
      { error: "Failed to load template activity." },
      { status: 500 },
    );
  }
}
