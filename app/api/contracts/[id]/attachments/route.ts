import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { sanitizeAttachmentForClient } from "@/lib/contract-attachment-storage";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { addContractAttachmentAndPersist } from "@/lib/contract-persistence";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { canManageContractDocuments } from "@/lib/legal-access";
import { reportError } from "@/lib/error-reporting";
import { getUserDisplayName } from "@/lib/user-display-name";
import {
  INTAKE_DOCUMENT_TYPES,
  MAX_INTAKE_ATTACHMENT_BYTES,
  type IntakeDocumentType,
} from "@/lib/intake-documents";
import { getSupabaseStorageSetupMessage, isSupabaseStorageConfigured } from "@/lib/supabase-storage";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { addContractAttachment } from "@/lib/contract-store";
import type { ContractIntakeAttachmentInput } from "@/types/contract";

function readFileAsBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!canManageContractDocuments(actorEmail)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id: contractId } = await context.params;
  const organizationId = resolveClauseLibraryOrganizationId();

  try {
    const contract = await loadMergedContractRecord(contractId, organizationId);

    if (!contract) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const documentType = String(formData.get("documentType") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }

    if (!INTAKE_DOCUMENT_TYPES.includes(documentType as IntakeDocumentType)) {
      return NextResponse.json(
        { error: "Select a valid document type." },
        { status: 400 },
      );
    }

    if (file.size > MAX_INTAKE_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: "Attached documents must be 10 MB or smaller." },
        { status: 400 },
      );
    }

    const actor = {
      email: actorEmail,
      name: getUserDisplayName(user),
    };
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const input: ContractIntakeAttachmentInput = {
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
      documentType: documentType as IntakeDocumentType,
      dataBase64: readFileAsBase64(buffer),
    };

    if (allowMemoryPersistence()) {
      const record = addContractAttachment(contractId, input, actor);
      const attachment = record.attachments.at(-1);

      return NextResponse.json({
        attachment: attachment
          ? sanitizeAttachmentForClient(attachment)
          : undefined,
      });
    }

    if (!isSupabaseStorageConfigured()) {
      return NextResponse.json(
        { error: getSupabaseStorageSetupMessage() },
        { status: 503 },
      );
    }

    const beforeCount = contract.attachments.length;
    const record = await addContractAttachmentAndPersist(
      contractId,
      organizationId,
      input,
      actor,
    );
    const attachment = record.attachments.at(beforeCount);

    if (!attachment) {
      return NextResponse.json(
        { error: "Failed to save attachment." },
        { status: 500 },
      );
    }

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: contractId,
      action: "contract_attachment_uploaded",
      actorEmail: actor.email,
      actorName: actor.name,
      detail: `Uploaded attachment ${file.name} to contract ${contract.recordNumber}.`,
      metadata: {
        attachmentId: attachment.id,
        storagePath: attachment.storagePath,
        documentType,
      },
    });

    return NextResponse.json({
      attachment: sanitizeAttachmentForClient(attachment),
    });
  } catch (error) {
    reportError(error, {
      route: "POST /api/contracts/[id]/attachments",
      contractId,
    });
    return NextResponse.json(
      { error: "Failed to upload attachment." },
      { status: 500 },
    );
  }
}
