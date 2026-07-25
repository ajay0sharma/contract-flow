import { NextRequest, NextResponse } from "next/server";
import {
  isTemplateManager,
  requireAuthenticatedTemplateReader,
  requireTemplateManager,
} from "@/lib/template-route-auth";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { parseUpdateFormData } from "@/lib/contract-template-api";
import {
  countInProgressContractsForTemplate,
  getContractTemplateById,
  updateContractTemplate,
} from "@/lib/contract-template-store";
import { getContractTypeLabel } from "@/types/contract-template";

function buildDefaultChangeMessage(
  previousTitle: string,
  newTitle: string,
  contractType: string,
): string {
  return `${previousTitle} is no longer the default. ${newTitle} is now the default for ${getContractTypeLabel(contractType)} contracts.`;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedTemplateReader();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const { id } = await context.params;
  const template = await getContractTemplateById(id, organizationId);

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  if (!template.isActive && !isTemplateManager(auth.actor.email)) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  return NextResponse.json({ template });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTemplateManager();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const { id } = await context.params;
  const existing = await getContractTemplateById(id, organizationId);

  if (!existing) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const confirmDeactivation =
    String(formData.get("confirmDeactivation") ?? "").trim() === "DEACTIVATE";
  const parsedDeactivate = parseBooleanField(formData.get("isActive"));
  const isDeactivating =
    parsedDeactivate === false && existing.isActive;

  if (isDeactivating && !confirmDeactivation) {
    const inProgressCount = await countInProgressContractsForTemplate(id);

    if (inProgressCount > 0) {
      return NextResponse.json(
        {
          error: "deactivation_confirmation_required",
          inProgressCount,
          message: `This template is currently being used by ${inProgressCount} contract${inProgressCount === 1 ? "" : "s"} in progress. Deactivating it will not affect those contracts but will prevent new contracts from using it. Continue?`,
        },
        { status: 409 },
      );
    }
  }

  let parsed: Awaited<ReturnType<typeof parseUpdateFormData>>;

  try {
    parsed = await parseUpdateFormData(
      formData,
      organizationId,
      id,
      existing.version + 1,
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid template payload. Check variables JSON." },
      { status: 400 },
    );
  }

  if (parsed.error || !parsed.input) {
    return NextResponse.json(
      { error: parsed.error ?? "Invalid template payload." },
      { status: 400 },
    );
  }

  parsed.input.lastUpdatedById = auth.actor.email;

  try {
    const result = await updateContractTemplate(id, organizationId, parsed.input, {
      placeholderWarning: parsed.placeholderWarning,
      actorName: auth.actor.actorName,
    });

    if (!result) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    return NextResponse.json({
      template: result.template,
      previousDefault: result.previousDefault,
      placeholderWarning: result.placeholderWarning,
      defaultChangeMessage: result.previousDefault
        ? buildDefaultChangeMessage(
            result.previousDefault.title,
            result.template.title,
            result.template.contractType,
          )
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update template.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTemplateManager();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const { id } = await context.params;
  const existing = await getContractTemplateById(id, organizationId);

  if (!existing) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  if (!existing.isActive) {
    return NextResponse.json({ template: existing });
  }

  try {
    const result = await updateContractTemplate(id, organizationId, {
      isActive: false,
      lastUpdatedById: auth.actor.email,
    }, {
      actorName: auth.actor.actorName,
    });

    if (!result) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    return NextResponse.json({ template: result.template });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to archive template.",
      },
      { status: 400 },
    );
  }
}

function parseBooleanField(value: FormDataEntryValue | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
}
