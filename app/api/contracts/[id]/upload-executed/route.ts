import { NextRequest, NextResponse } from "next/server";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import {
  validateExecutedDocumentFile,
  resolveDocumentContentType,
} from "@/lib/obligation-document-text";
import {
  buildExecutedDocumentStoragePath,
  uploadExecutedDocument,
} from "@/lib/supabase-storage";
import { getPrismaClient } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const organizationId = resolveClauseLibraryOrganizationId();

  try {
    const prisma = getPrismaClient();
    const contract = await prisma.contract.findFirst({
      where: { id, organizationId },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("document");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A document file is required." },
        { status: 400 },
      );
    }

    const validationError = validateExecutedDocumentFile(file.name, file.size);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = buildExecutedDocumentStoragePath(
      organizationId,
      contract.id,
      file.name,
    );

    await uploadExecutedDocument(
      storagePath,
      buffer,
      resolveDocumentContentType(file.name),
    );

    const uploadedAt = new Date();
    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: {
        executedDocumentPath: storagePath,
        executedDocumentName: file.name,
        executedDocumentSize: file.size,
        executedUploadedAt: uploadedAt,
        executedUploadedById: auth.actor.userId,
        obligationScanStatus: "not_scanned",
        obligationScanCompletedAt: null,
      },
      select: {
        id: true,
        executedDocumentPath: true,
        executedDocumentName: true,
        executedDocumentSize: true,
        executedUploadedAt: true,
        executedUploadedById: true,
        obligationScanStatus: true,
        obligationScanCompletedAt: true,
        obligationScanVersion: true,
      },
    });

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: contract.id,
      action: "executed_document_uploaded",
      detail: `Fully executed agreement uploaded: ${file.name}`,
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
    });

    return NextResponse.json({
      ...updated,
      executedUploadedAt: updated.executedUploadedAt?.toISOString() ?? null,
      obligationScanCompletedAt:
        updated.obligationScanCompletedAt?.toISOString() ?? null,
    });
  } catch (error) {
    reportError(error, {
      route: "POST /api/contracts/[id]/upload-executed",
      contractId: id,
    });
    return NextResponse.json(
      { error: "Failed to upload executed document." },
      { status: 500 },
    );
  }
}
