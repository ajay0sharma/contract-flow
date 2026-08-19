import { NextRequest, NextResponse } from "next/server";
import { requireLegalApiActor } from "@/lib/api-legal-auth";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { updateLegalReviewDeviation } from "@/lib/legal-review-store";
import type { UpdateLegalReviewDeviationInput } from "@/types/legal-review";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; roundId: string; deviationId: string }> },
) {
  const auth = await requireLegalApiActor({
    forbiddenMessage: "Only legal users can update legal review deviations.",
  });

  if ("response" in auth) {
    return auth.response;
  }

  const { id: contractId, roundId, deviationId } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(contractId)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const body = (await request.json()) as UpdateLegalReviewDeviationInput;
    const deviation = await updateLegalReviewDeviation(
      contractId,
      organizationId,
      roundId,
      deviationId,
      body,
    );

    return NextResponse.json({ deviation });
  } catch (error) {
    reportError(error, {
      route: "PATCH /api/contracts/[id]/legal-review/[roundId]/deviations/[deviationId]",
      contractId,
      roundId,
      deviationId,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update deviation.",
      },
      { status: 400 },
    );
  }
}
