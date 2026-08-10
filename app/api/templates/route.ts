import { NextRequest, NextResponse } from "next/server";
import {
  isTemplateManager,
  requireAuthenticatedTemplateReader,
  requireTemplateManager,
  resolveTemplateOrganizationId,
} from "@/lib/template-route-auth";
import { parseCreateFormData } from "@/lib/contract-template-api";
import {
  createContractTemplate,
  listActiveContractTemplates,
  listContractTemplates,
} from "@/lib/contract-template-store";
import { getContractTypeLabel } from "@/types/contract-template";

function buildDefaultChangeMessage(
  previousTitle: string,
  newTitle: string,
  contractType: string,
): string {
  return `${previousTitle} is no longer the default. ${newTitle} is now the default for ${getContractTypeLabel(contractType)} contracts.`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedTemplateReader();

  if ("response" in auth) {
    return auth.response;
  }

  let organizationId: string;

  try {
    organizationId = await resolveTemplateOrganizationId(
      auth.actor.email,
      request,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "You do not have access to this client organization.",
      },
      { status: 403 },
    );
  }

  const templates = isTemplateManager(auth.actor.email)
    ? await listContractTemplates(organizationId)
    : await listActiveContractTemplates(organizationId);

  return NextResponse.json({ templates, organizationId });
}

export async function POST(request: NextRequest) {
  const auth = await requireTemplateManager();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = await resolveTemplateOrganizationId(auth.actor.email);
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  let parsed: Awaited<ReturnType<typeof parseCreateFormData>>;

  try {
    parsed = await parseCreateFormData(
      formData,
      organizationId,
      auth.actor.email,
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

  try {
    const result = await createContractTemplate(parsed.input, {
      placeholderWarning: parsed.placeholderWarning,
      actorName: auth.actor.actorName,
    });

    return NextResponse.json(
      {
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
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create template.",
      },
      { status: 400 },
    );
  }
}
