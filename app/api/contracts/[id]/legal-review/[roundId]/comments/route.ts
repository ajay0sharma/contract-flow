import { NextRequest, NextResponse } from "next/server";
import { requireLegalApiActor } from "@/lib/api-legal-auth";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { addLegalReviewComment } from "@/lib/legal-review-store";
import type { CreateLegalReviewCommentInput } from "@/types/legal-review";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; roundId: string }> },
) {
  const auth = await requireLegalApiActor({
    forbiddenMessage: "Only legal users can comment on legal review rounds.",
  });

  if ("response" in auth) {
    return auth.response;
  }

  const { id: contractId, roundId } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(contractId)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const body = (await request.json()) as CreateLegalReviewCommentInput;
    const comment = await addLegalReviewComment(
      contractId,
      organizationId,
      roundId,
      body,
      auth.actor,
    );

    return NextResponse.json({ comment });
  } catch (error) {
    reportError(error, {
      route: "POST /api/contracts/[id]/legal-review/[roundId]/comments",
      contractId,
      roundId,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to add comment.",
      },
      { status: 400 },
    );
  }
}
