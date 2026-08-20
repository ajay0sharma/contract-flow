import { NextRequest, NextResponse } from "next/server";
import { requireLegalApiActor } from "@/lib/api-legal-auth";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import {
  compareLegalReviewRound,
  completeLegalReviewRound,
  getLegalReviewRound,
} from "@/lib/legal-review-store";
import { sanitizeLegalReviewRoundForClient } from "@/lib/legal-review-redline-storage";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; roundId: string }> },
) {
  const auth = await requireLegalApiActor({
    forbiddenMessage: "Only legal users can access legal review comparisons.",
  });

  if ("response" in auth) {
    return auth.response;
  }

  const { id: contractId, roundId } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(contractId)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const round = await getLegalReviewRound(contractId, organizationId, roundId);

    if (!round) {
      return NextResponse.json({ error: "Review round not found." }, { status: 404 });
    }

    return NextResponse.json({ round: sanitizeLegalReviewRoundForClient(round) });
  } catch (error) {
    reportError(error, {
      route: "GET /api/contracts/[id]/legal-review/[roundId]",
      contractId,
      roundId,
    });

    return NextResponse.json(
      { error: "Failed to load legal review round." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; roundId: string }> },
) {
  const auth = await requireLegalApiActor({
    forbiddenMessage: "Only legal users can update legal review rounds.",
  });

  if ("response" in auth) {
    return auth.response;
  }

  const { id: contractId, roundId } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(contractId)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const body = (await request.json()) as { action?: "compare" | "complete" };

    if (body.action === "complete") {
      const round = await completeLegalReviewRound(
        contractId,
        organizationId,
        roundId,
        auth.actor,
      );

      return NextResponse.json({ round: sanitizeLegalReviewRoundForClient(round) });
    }

    const round = await compareLegalReviewRound(
      contractId,
      organizationId,
      roundId,
      auth.actor,
    );

    return NextResponse.json({ round: sanitizeLegalReviewRoundForClient(round) });
  } catch (error) {
    reportError(error, {
      route: "POST /api/contracts/[id]/legal-review/[roundId]",
      contractId,
      roundId,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update legal review round.",
      },
      { status: 400 },
    );
  }
}
