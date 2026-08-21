import { NextRequest, NextResponse } from "next/server";
import { requireLegalApiActor } from "@/lib/api-legal-auth";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { bulkUpdateLegalReviewDeviations } from "@/lib/legal-review-store";
import type { BulkUpdateLegalReviewDeviationsInput } from "@/types/legal-review";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; roundId: string }> },
) {
  const auth = await requireLegalApiActor({
    forbiddenMessage: "Only legal users can update legal review deviations.",
  });

  if ("response" in auth) {
    return auth.response;
  }

  const { id: contractId, roundId } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(contractId)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const body = (await request.json()) as BulkUpdateLegalReviewDeviationsInput;
    const deviations = await bulkUpdateLegalReviewDeviations(
      contractId,
      organizationId,
      roundId,
      body,
    );

    return NextResponse.json({ deviations });
  } catch (error) {
    reportError(error, {
      route: "PATCH /api/contracts/[id]/legal-review/[roundId]/deviations/bulk",
      contractId,
      roundId,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to bulk update deviations.",
      },
      { status: 400 },
    );
  }
}
