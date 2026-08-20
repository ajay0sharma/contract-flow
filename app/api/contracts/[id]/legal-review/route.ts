import { NextRequest, NextResponse } from "next/server";
import { requireLegalApiActor } from "@/lib/api-legal-auth";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import {
  compareLegalReviewRound,
  createLegalReviewRound,
  listLegalReviewRounds,
} from "@/lib/legal-review-store";
import { sanitizeLegalReviewRoundForClient } from "@/lib/legal-review-redline-storage";
import type { CreateLegalReviewRoundInput } from "@/types/legal-review";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalApiActor({
    forbiddenMessage: "Only legal users can access legal review comparisons.",
  });

  if ("response" in auth) {
    return auth.response;
  }

  const { id: contractId } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(contractId)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const rounds = await listLegalReviewRounds(contractId, organizationId);

    return NextResponse.json({
      rounds: rounds.map(sanitizeLegalReviewRoundForClient),
    });
  } catch (error) {
    reportError(error, {
      route: "GET /api/contracts/[id]/legal-review",
      contractId,
    });

    return NextResponse.json(
      { error: "Failed to load legal review rounds." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalApiActor({
    forbiddenMessage: "Only legal users can start legal review comparisons.",
  });

  if ("response" in auth) {
    return auth.response;
  }

  const { id: contractId } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(contractId)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const body = (await request.json()) as CreateLegalReviewRoundInput & {
      runComparison?: boolean;
    };

    const round = await createLegalReviewRound(
      contractId,
      organizationId,
      {
        baselineAttachmentId: body.baselineAttachmentId,
        counterpartyAttachmentId: body.counterpartyAttachmentId,
      },
      auth.actor,
    );

    if (body.runComparison !== false) {
      try {
        const compared = await compareLegalReviewRound(
          contractId,
          organizationId,
          round.id,
          auth.actor,
        );

        return NextResponse.json({ round: sanitizeLegalReviewRoundForClient(compared) });
      } catch (compareError) {
        return NextResponse.json({
          round: sanitizeLegalReviewRoundForClient(round),
          comparisonError:
            compareError instanceof Error
              ? compareError.message
              : "Comparison could not be completed.",
        });
      }
    }

    return NextResponse.json({ round: sanitizeLegalReviewRoundForClient(round) });
  } catch (error) {
    reportError(error, {
      route: "POST /api/contracts/[id]/legal-review",
      contractId,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start legal review round.",
      },
      { status: 400 },
    );
  }
}
