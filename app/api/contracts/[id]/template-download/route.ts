import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { recordTemplateAuditLog } from "@/lib/audit-log";
import { canViewContractRecord, getContractById } from "@/lib/contract-store";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { mergeContractTemplateDraftFromRecord } from "@/lib/contract-template-merge";
import { saveContractRecord } from "@/lib/contract-persistence";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { getTemplateFileAtVersion } from "@/lib/contract-template-store";
import { captureException } from "@/lib/error-reporting";
import { getUserDisplayName } from "@/lib/user-display-name";
import {
  createExecutedDocumentSignedUrl,
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
    let signedUrl: string;
    let fileName = fileReference.fileName;
    let isGeneratedDraft = false;
    let missingVariables = contract.missingVariables ?? [];

    if (contract.generatedDraftPath) {
      signedUrl = await createExecutedDocumentSignedUrl(
        contract.generatedDraftPath,
      );
      fileName = contract.generatedDraftPath.split("/").pop() ?? fileName;
      isGeneratedDraft = true;
    } else {
      const mergeOutcome = await mergeContractTemplateDraftFromRecord(contract);

      if (mergeOutcome) {
        signedUrl = await createExecutedDocumentSignedUrl(
          mergeOutcome.generatedDraftPath,
        );
        fileName = mergeOutcome.draftFileName;
        isGeneratedDraft = true;
        missingVariables =
          mergeOutcome.missingVariables.length > 0
            ? mergeOutcome.missingVariables
            : [];

        if (!allowMemoryPersistence()) {
          try {
            await saveContractRecord({
              ...contract,
              generatedDraftPath: mergeOutcome.generatedDraftPath,
              missingVariables:
                mergeOutcome.missingVariables.length > 0
                  ? mergeOutcome.missingVariables
                  : null,
              updatedAt: new Date().toISOString(),
            });
          } catch (persistError) {
            captureException(persistError, {
              contractId: contract.id,
              generatedDraftPath: mergeOutcome.generatedDraftPath,
              stage: "persist_generated_draft",
            });
          }
        }
      } else {
        signedUrl = await createTemplateSignedDownloadUrl(
          fileReference.storagePath,
        );
      }
    }

    await recordTemplateAuditLog({
      organizationId: contract.companyProfileId,
      entityId: contract.templateId,
      action: "template_downloaded",
      detail: isGeneratedDraft
        ? `Downloaded generated draft for contract ${contract.recordNumber}.`
        : `Downloaded pinned template version ${fileReference.version} for contract ${contract.recordNumber}.`,
      actorEmail: email,
      actorName: getUserDisplayName(user),
      metadata: {
        contractId: contract.id,
        contractRecordNumber: contract.recordNumber,
        version: fileReference.version,
        fileName,
        isGeneratedDraft,
      },
    });

    return NextResponse.json({
      signedUrl,
      fileName,
      fileSize: fileReference.fileSize,
      version: fileReference.version,
      templateId: contract.templateId,
      isGeneratedDraft,
      missingVariables,
    });
  } catch (error) {
    captureException(error, {
      contractId: contract.id,
      templateId: contract.templateId,
      templateVersion: contract.templateVersion,
      generatedDraftPath: contract.generatedDraftPath,
      storagePath: fileReference.storagePath,
      actorEmail: email,
    });

    return NextResponse.json(
      { error: DOWNLOAD_LINK_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}
