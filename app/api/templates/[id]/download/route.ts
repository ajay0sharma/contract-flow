import { NextRequest, NextResponse } from "next/server";
import { requireTemplateDocumentAccess } from "@/lib/template-route-auth";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { recordTemplateAuditLog } from "@/lib/audit-log";
import {
  getContractTemplateById,
  getTemplateFileAtVersion,
} from "@/lib/contract-template-store";
import { captureException } from "@/lib/error-reporting";
import {
  createTemplateSignedDownloadUrl,
  getSupabaseStorageSetupMessage,
  isSupabaseStorageConfigured,
} from "@/lib/supabase-storage";
import { DOWNLOAD_LINK_ERROR_MESSAGE } from "@/types/contract-template";

function parseVersionParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const version = Number.parseInt(value, 10);
  return Number.isInteger(version) && version > 0 ? version : undefined;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTemplateDocumentAccess();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const { id } = await context.params;
  const template = await getContractTemplateById(id, organizationId);

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const requestedVersion =
    parseVersionParam(request.nextUrl.searchParams.get("version")) ??
    template.version;
  const intent = request.nextUrl.searchParams.get("intent")?.trim() ?? "download";
  const isOpenIntent = intent === "open";
  const fileReference = await getTemplateFileAtVersion(
    id,
    requestedVersion,
    organizationId,
  );

  if (!fileReference) {
    return NextResponse.json(
      { error: "Template version not found." },
      { status: 404 },
    );
  }

  if (!isSupabaseStorageConfigured()) {
    return NextResponse.json(
      {
        error: getSupabaseStorageSetupMessage(),
      },
      { status: 503 },
    );
  }

  try {
    const signedUrl = await createTemplateSignedDownloadUrl(
      fileReference.storagePath,
    );

    await recordTemplateAuditLog({
      organizationId,
      entityId: template.id,
      action: isOpenIntent ? "template_opened" : "template_downloaded",
      detail: isOpenIntent
        ? `Opened template "${template.title}" version ${fileReference.version} for editing.`
        : `Downloaded template "${template.title}" version ${fileReference.version}.`,
      actorEmail: auth.actor.email,
      actorName: auth.actor.actorName,
      metadata: {
        templateTitle: template.title,
        contractType: template.contractType,
        version: fileReference.version,
        fileName: fileReference.fileName,
        intent,
      },
    });

    return NextResponse.json({
      signedUrl,
      fileName: fileReference.fileName,
      fileSize: fileReference.fileSize,
      version: fileReference.version,
    });
  } catch (error) {
    captureException(error, {
      templateId: id,
      version: fileReference.version,
      storagePath: fileReference.storagePath,
      actorEmail: auth.actor.email,
    });

    return NextResponse.json(
      { error: DOWNLOAD_LINK_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}
