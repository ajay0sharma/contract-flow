import { NextRequest, NextResponse } from "next/server";
import { requireLegalApiActor } from "@/lib/api-legal-auth";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { generateLegalReviewExport } from "@/lib/legal-review-export";
import { getLegalReviewRound } from "@/lib/legal-review-store";

function buildDataDownloadUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; roundId: string; format: string }> },
) {
  const auth = await requireLegalApiActor({
    forbiddenMessage: "Only legal users can download legal review exports.",
  });

  if ("response" in auth) {
    return auth.response;
  }

  const { id: contractId, roundId, format } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(contractId)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const round = await getLegalReviewRound(contractId, organizationId, roundId);

    if (!round) {
      return NextResponse.json({ error: "Review round not found." }, { status: 404 });
    }

    if (!round.comparedAt) {
      return NextResponse.json(
        { error: "Comparison has not been run for this round yet." },
        { status: 404 },
      );
    }

    const normalizedFormat = format.toLowerCase();

    if (
      normalizedFormat !== "pdf" &&
      normalizedFormat !== "html" &&
      normalizedFormat !== "csv" &&
      normalizedFormat !== "clean-docx"
    ) {
      return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
    }

    const exported = await generateLegalReviewExport(round, normalizedFormat);

    return NextResponse.json({
      url: buildDataDownloadUrl(exported.buffer, exported.mimeType),
      fileName: exported.fileName,
    });
  } catch (error) {
    reportError(error, {
      route: "GET /api/contracts/[id]/legal-review/[roundId]/exports/[format]",
      contractId,
      roundId,
      format,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate export.",
      },
      { status: 400 },
    );
  }
}
