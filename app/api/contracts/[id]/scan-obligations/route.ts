import { NextResponse } from "next/server";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { runObligationScanForContract } from "@/lib/obligation-scan-service";
import { getPrismaClient } from "@/lib/prisma";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    if (auth.response.status === 403) {
      return NextResponse.json(
        { error: "Only legal users can run obligation scans" },
        { status: 403 },
      );
    }

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
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    if (!contract.executedDocumentPath) {
      return NextResponse.json(
        {
          error:
            "No executed document found. Please upload the fully executed agreement before scanning for obligations.",
        },
        { status: 400 },
      );
    }

    const result = await runObligationScanForContract({
      contractId: id,
      organizationId,
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes("No executed document") ||
        error.message.includes("Could not extract text") ||
        error.message.includes("unexpected response")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    try {
      const prisma = getPrismaClient();
      await prisma.contract.update({
        where: { id },
        data: { obligationScanStatus: "failed" },
      });
    } catch {
      // ignore secondary failure
    }

    reportError(error, {
      route: "POST /api/contracts/[id]/scan-obligations",
      contractId: id,
    });

    return NextResponse.json(
      { error: "Failed to scan obligations. Please try again." },
      { status: 500 },
    );
  }
}
