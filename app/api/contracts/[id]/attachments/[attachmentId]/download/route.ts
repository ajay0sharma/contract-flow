import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sanitizeAttachmentForClient } from "@/lib/contract-attachment-storage";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { canViewContractRecord } from "@/lib/contract-store";
import { reportError } from "@/lib/error-reporting";
import {
  createContractAttachmentSignedUrl,
  getSupabaseStorageSetupMessage,
  isSupabaseStorageConfigured,
} from "@/lib/supabase-storage";

const EXPIRES_IN_SECONDS = 30 * 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: contractId, attachmentId } = await context.params;
  const organizationId =
    (await resolveContractOrganizationId(contractId)) ??
    resolveClauseLibraryOrganizationId();

  try {
    const contract = await loadMergedContractRecord(contractId, organizationId);

    if (!contract) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    if (!canViewContractRecord(contract, actorEmail)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const attachment = contract.attachments.find((item) => item.id === attachmentId);

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    if (attachment.storagePath?.trim()) {
      if (!isSupabaseStorageConfigured()) {
        return NextResponse.json(
          { error: getSupabaseStorageSetupMessage() },
          { status: 503 },
        );
      }

      const url = await createContractAttachmentSignedUrl(
        attachment.storagePath,
        EXPIRES_IN_SECONDS,
      );
      const expiresAt = new Date(
        Date.now() + EXPIRES_IN_SECONDS * 1000,
      ).toISOString();

      return NextResponse.json({
        url,
        fileName: attachment.fileName,
        expiresAt,
        attachment: sanitizeAttachmentForClient(attachment),
      });
    }

    if (attachment.dataBase64?.trim()) {
      const dataUrl = `data:${attachment.mimeType};base64,${attachment.dataBase64}`;

      return NextResponse.json({
        url: dataUrl,
        fileName: attachment.fileName,
        expiresAt: null,
        attachment: sanitizeAttachmentForClient(attachment),
      });
    }

    return NextResponse.json(
      { error: "Attachment file is not available." },
      { status: 404 },
    );
  } catch (error) {
    reportError(error, {
      route: "GET /api/contracts/[id]/attachments/[attachmentId]/download",
      contractId,
      attachmentId,
    });
    return NextResponse.json(
      { error: "Failed to generate download link." },
      { status: 500 },
    );
  }
}
