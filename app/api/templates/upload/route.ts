import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  parseCreateFormData,
  parseUpdateFormData,
} from "@/lib/contract-template-api";
import {
  createContractTemplate,
  getContractTemplateById,
  updateContractTemplate,
} from "@/lib/contract-template-store";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { validateTemplateFileSize } from "@/lib/supabase-storage";
import { getUserDisplayName } from "@/lib/user-display-name";
import { getContractTypeLabel } from "@/types/contract-template";

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function buildDefaultChangeMessage(
  previousTitle: string,
  newTitle: string,
  contractType: string,
): string {
  return `${previousTitle} is no longer the default. ${newTitle} is now the default for ${getContractTypeLabel(contractType)} contracts.`;
}

export async function POST(request: Request): Promise<Response> {
  let user;

  try {
    user = await currentUser();
  } catch {
    return jsonError("Authentication failed", 401);
  }

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (!isLegalEmail(email) && !isAdminEmail(email)) {
    return jsonError("Only legal users can upload templates", 403);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonError(
      "Could not read the uploaded file. Please try again.",
      400,
    );
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return jsonError(
      "No file provided. Please select a Word document to upload.",
      400,
    );
  }

  const sizeError = validateTemplateFileSize(file.size);

  if (sizeError) {
    return jsonError(sizeError, 400);
  }

  const fileName = file.name.toLowerCase();

  if (!fileName.endsWith(".docx")) {
    return jsonError(
      "Only Word documents (.docx) are supported. Please save your template as a .docx file before uploading.",
      400,
    );
  }

  const title = String(formData.get("title") ?? "").trim();
  const contractType = String(formData.get("contractType") ?? "").trim();
  const existingTemplateId = String(formData.get("templateId") ?? "").trim() || null;

  if (!title) {
    return jsonError("Template title is required.", 400);
  }

  if (!contractType) {
    return jsonError("Contract type is required.", 400);
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const actorName = getUserDisplayName(user);

  try {
    if (existingTemplateId) {
      const existing = await getContractTemplateById(
        existingTemplateId,
        organizationId,
      );

      if (!existing) {
        return jsonError("Template not found.", 404);
      }

      const parsed = await parseUpdateFormData(
        formData,
        organizationId,
        existingTemplateId,
        existing.version + 1,
      );

      if (parsed.error || !parsed.input) {
        return jsonError(parsed.error ?? "Invalid template payload.", 400);
      }

      if (!parsed.input.file) {
        return jsonError(
          "No file provided. Please select a Word document to upload.",
          400,
        );
      }

      parsed.input.lastUpdatedById = email;

      const result = await updateContractTemplate(
        existingTemplateId,
        organizationId,
        parsed.input,
        {
          placeholderWarning: parsed.placeholderWarning,
          actorName,
        },
      );

      if (!result) {
        return jsonError("Template not found.", 404);
      }

      return NextResponse.json({
        success: true,
        template: result.template,
        previousDefault: result.previousDefault,
        versionUploaded: result.versionUploaded,
        placeholderWarning: result.placeholderWarning,
        defaultChangeMessage: result.previousDefault
          ? buildDefaultChangeMessage(
              result.previousDefault.title,
              result.template.title,
              result.template.contractType,
            )
          : null,
      });
    }

    const parsed = await parseCreateFormData(formData, organizationId, email);

    if (parsed.error || !parsed.input) {
      return jsonError(parsed.error ?? "Invalid template payload.", 400);
    }

    const result = await createContractTemplate(parsed.input, {
      placeholderWarning: parsed.placeholderWarning,
      actorName,
    });

    return NextResponse.json(
      {
        success: true,
        template: result.template,
        previousDefault: result.previousDefault,
        versionUploaded: false,
        placeholderWarning: result.placeholderWarning,
        defaultChangeMessage: result.previousDefault
          ? buildDefaultChangeMessage(
              result.previousDefault.title,
              result.template.title,
              result.template.contractType,
            )
          : null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Template upload failed:", error);
    reportError(error, { route: "POST /api/templates/upload" });

    const message = error instanceof Error ? error.message : "";

    if (message.includes("Bucket not found") || message.includes("bucket")) {
      return jsonError(
        'Storage bucket not configured. Please ask your administrator to create the contract-templates bucket in Supabase Storage.',
        500,
      );
    }

    if (message.includes("Invalid API key") || message.includes("credentials")) {
      return jsonError(
        "Storage credentials are not configured correctly. Please check SUPABASE_SERVICE_ROLE_KEY in your environment variables.",
        500,
      );
    }

    if (
      message.includes("SUPABASE_URL") ||
      message.includes("SERVICE_ROLE_KEY")
    ) {
      return jsonError(message, 500);
    }

    return jsonError("Upload failed. Please try again.", 500);
  }
}
