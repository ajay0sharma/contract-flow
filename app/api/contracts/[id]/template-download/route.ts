import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { recordTemplateAuditLog } from "@/lib/audit-log";
import { canViewContractRecord, getContractById } from "@/lib/contract-store";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { getTemplateFileAtVersion } from "@/lib/contract-template-store";
import { captureException } from "@/lib/error-reporting";
import { getUserDisplayName } from "@/lib/user-display-name";
import {
  createTemplateSignedDownloadUrl,
  getSupabaseStorageSetupMessage,
  isSupabaseStorageConfigured,
} from "@/lib/supabase-storage";
import { DOWNLOAD_LINK_ERROR_MESSAGE } from "@/types/contract-template";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const { id: contractId } = await context.params;
  const contract = allowMemoryPersistence()
    ? getContractById(contractId)
    : await loadMergedContractRecord(
        contractId,
        resolveClauseLibraryOrganizationId(),
      );

  if (!contract) {
    return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  }

  if (!canViewContractRecord(contract, email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!contract.templateId || !contract.templateVersion) {
    return NextResponse.json(
      { error: "This contract was not generated from a template." },
      { status: 404 },
    );
  }

  const fileReference = await getTemplateFileAtVersion(
    contract.templateId,
    contract.templateVersion,
    contract.companyProfileId,
  );

  if (!fileReference) {
    return NextResponse.json(
      { error: "Template version not found for this contract." },
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
      organizationId: contract.companyProfileId,
      entityId: contract.templateId,
      action: "template_downloaded",
      detail: `Downloaded pinned template version ${fileReference.version} for contract ${contract.recordNumber}.`,
      actorEmail: email,
      actorName: getUserDisplayName(user),
      metadata: {
        contractId: contract.id,
        contractRecordNumber: contract.recordNumber,
        version: fileReference.version,
        fileName: fileReference.fileName,
      },
    });

    return NextResponse.json({
      signedUrl,
      fileName: fileReference.fileName,
      fileSize: fileReference.fileSize,
      version: fileReference.version,
      templateId: contract.templateId,
    });
  } catch (error) {
    captureException(error, {
      contractId: contract.id,
      templateId: contract.templateId,
      templateVersion: contract.templateVersion,
      storagePath: fileReference.storagePath,
      actorEmail: email,
    });

    return NextResponse.json(
      { error: DOWNLOAD_LINK_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}
