import { NextResponse } from "next/server";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { createExecutedDocumentSignedUrl } from "@/lib/supabase-storage";
import { getPrismaClient } from "@/lib/prisma";

const EXPIRES_IN_SECONDS = 30 * 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(id)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const prisma = getPrismaClient();
    const contract = await prisma.contract.findFirst({
      where: { id, organizationId },
      select: {
        executedDocumentPath: true,
        executedDocumentName: true,
      },
    });

    if (!contract?.executedDocumentPath) {
      return NextResponse.json(
        { error: "No executed document found." },
        { status: 404 },
      );
    }

    const url = await createExecutedDocumentSignedUrl(
      contract.executedDocumentPath,
      EXPIRES_IN_SECONDS,
    );
    const expiresAt = new Date(Date.now() + EXPIRES_IN_SECONDS * 1000).toISOString();

    return NextResponse.json({
      url,
      fileName: contract.executedDocumentName,
      expiresAt,
    });
  } catch (error) {
    reportError(error, {
      route: "GET /api/contracts/[id]/download-executed",
      contractId: id,
    });
    return NextResponse.json(
      { error: "Failed to generate download link." },
      { status: 500 },
    );
  }
}
