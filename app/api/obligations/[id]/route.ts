import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ObligationStatus, ObligationType } from "@/lib/generated/prisma/enums";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { getPrismaClient } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const organizationId = resolveClauseLibraryOrganizationId();

  try {
    const body = (await request.json()) as { status?: ObligationStatus };

    if (!body.status) {
      return NextResponse.json(
        { error: "Status is required." },
        { status: 400 },
      );
    }

    const prisma = getPrismaClient();
    const existing = await prisma.obligation.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Obligation not found." }, { status: 404 });
    }

    const updated = await prisma.obligation.update({
      where: { id },
      data: { status: body.status },
    });

    const truncatedDescription =
      updated.description.length > 80
        ? `${updated.description.slice(0, 80)}…`
        : updated.description;

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: updated.contractId,
      action: "obligation_status_updated",
      detail: `Obligation marked as ${body.status}: ${truncatedDescription}`,
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
    });

    return NextResponse.json({
      ...updated,
      dueDate: updated.dueDate?.toISOString() ?? null,
      actionDeadline: updated.actionDeadline?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    reportError(error, {
      route: "PATCH /api/obligations/[id]",
      obligationId: id,
    });
    return NextResponse.json(
      { error: "Failed to update obligation." },
      { status: 500 },
    );
  }
}
