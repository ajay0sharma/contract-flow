import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  createContractType,
  listContractTypes,
} from "@/lib/contract-type-store";
import {
  requireAuthenticatedTemplateReader,
  requireTemplateManager,
} from "@/lib/template-route-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedTemplateReader();

  if ("response" in auth) {
    return auth.response;
  }

  const orgFromParam = request.nextUrl.searchParams.get("organizationId")?.trim();
  const organizationId =
    orgFromParam || resolveClauseLibraryOrganizationId();
  const includeInactive =
    request.nextUrl.searchParams.get("includeInactive") === "true" &&
    auth.actor.email.length > 0;

  const contractTypes = await listContractTypes(organizationId, {
    includeInactive: includeInactive,
  });

  return NextResponse.json({ contractTypes, organizationId });
}

export async function POST(request: NextRequest) {
  const auth = await requireTemplateManager();

  if ("response" in auth) {
    return auth.response;
  }

  let body: { label?: string; description?: string | null; organizationId?: string };

  try {
    body = (await request.json()) as {
      label?: string;
      description?: string | null;
      organizationId?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const organizationId = resolveClauseLibraryOrganizationId(
    body.organizationId,
  );
  const result = await createContractType({
    organizationId,
    label: body.label ?? "",
    description: body.description,
    createdById: auth.actor.email,
  });

  if (result.error || !result.type) {
    return NextResponse.json(
      { error: result.error ?? "Unable to create contract type." },
      { status: 400 },
    );
  }

  return NextResponse.json({ contractType: result.type }, { status: 201 });
}
