import { NextResponse } from "next/server";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { getPrismaClient } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const organizationId = resolveClauseLibraryOrganizationId();

  try {
    const prisma = getPrismaClient();
    const contract = await prisma.contract.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        executedDocumentPath: true,
        executedDocumentName: true,
        executedDocumentSize: true,
        executedUploadedAt: true,
        executedUploadedById: true,
        obligationScanStatus: true,
        obligationScanCompletedAt: true,
        obligationScanVersion: true,
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const obligations = await prisma.obligation.findMany({
      where: { contractId: id, organizationId },
      orderBy: [{ obligationType: "asc" }, { dueDate: "asc" }],
    });

    return NextResponse.json({
      contractId: contract.id,
      executedDocument: contract.executedDocumentPath
        ? {
            name: contract.executedDocumentName,
            size: contract.executedDocumentSize,
            uploadedAt: contract.executedUploadedAt?.toISOString() ?? null,
            uploadedById: contract.executedUploadedById,
          }
        : null,
      scanStatus: contract.obligationScanStatus,
      scanCompletedAt: contract.obligationScanCompletedAt?.toISOString() ?? null,
      scanVersion: contract.obligationScanVersion,
      obligations: obligations.map((item) => ({
        ...item,
        dueDate: item.dueDate?.toISOString() ?? null,
        actionDeadline: item.actionDeadline?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    reportError(error, {
      route: "GET /api/contracts/[id]/obligation-panel",
      contractId: id,
    });
    return NextResponse.json(
      { error: "Failed to load obligation panel data." },
      { status: 500 },
    );
  }
}
