import { NextRequest, NextResponse } from "next/server";
import { requireLegalApiActor } from "@/lib/api-legal-auth";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { generateLegalReviewExport } from "@/lib/legal-review-export";
import { getLegalReviewRound } from "@/lib/legal-review-store";
import {
  createContractAttachmentSignedUrl,
  getSupabaseStorageSetupMessage,
  isSupabaseStorageConfigured,
} from "@/lib/supabase-storage";

const EXPIRES_IN_SECONDS = 30 * 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; roundId: string }> },
) {
  const auth = await requireLegalApiActor({
    forbiddenMessage: "Only legal users can download legal review redlines.",
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

    const format = request.nextUrl.searchParams.get("format")?.toLowerCase() ?? "docx";

    if (format === "pdf" || format === "html") {
      const exported = await generateLegalReviewExport(round, format);
      return NextResponse.json({
        url: `data:${exported.mimeType};base64,${exported.buffer.toString("base64")}`,
        fileName: exported.fileName,
      });
    }

    if (format !== "docx") {
      return NextResponse.json({ error: "Unsupported redline format." }, { status: 400 });
    }

    const redline = round.redlineDocument;

    if (!redline) {
      return NextResponse.json(
        { error: "Redline document has not been generated for this round yet." },
        { status: 404 },
      );
    }

    if (redline.storagePath?.trim()) {
      if (!isSupabaseStorageConfigured()) {
        return NextResponse.json(
          { error: getSupabaseStorageSetupMessage() },
          { status: 503 },
        );
      }

      const url = await createContractAttachmentSignedUrl(
        redline.storagePath,
        EXPIRES_IN_SECONDS,
      );

      return NextResponse.json({
        url,
        fileName: redline.fileName,
        expiresAt: new Date(Date.now() + EXPIRES_IN_SECONDS * 1000).toISOString(),
      });
    }

    if (redline.dataBase64?.trim()) {
      const dataUrl = `data:${redline.mimeType};base64,${redline.dataBase64}`;

      return NextResponse.json({
        url: dataUrl,
        fileName: redline.fileName,
      });
    }

    return NextResponse.json(
      { error: "Redline document is unavailable." },
      { status: 404 },
    );
  } catch (error) {
    reportError(error, {
      route: "GET /api/contracts/[id]/legal-review/[roundId]/redline/download",
      contractId,
      roundId,
    });

    return NextResponse.json(
      { error: "Failed to load redline download link." },
      { status: 500 },
    );
  }
}
