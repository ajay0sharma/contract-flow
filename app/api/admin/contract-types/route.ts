import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  createContractType,
  listContractTypes,
} from "@/lib/contract-type-store";
import { requireAdminActor } from "@/lib/directory-route-utils";
import { reportError } from "@/lib/error-reporting";

export async function GET() {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const contractTypes = await listContractTypes(organizationId, {
    includeInactive: true,
  });

  return NextResponse.json({ contractTypes, organizationId });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    let body: {
      label?: string;
      description?: string | null;
      canBeParentAgreement?: boolean;
      requiresParentAgreement?: boolean;
    };

    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const organizationId = resolveClauseLibraryOrganizationId();
    const result = await createContractType({
      organizationId,
      label: body.label ?? "",
      description: body.description,
      createdById: auth.actorEmail,
      canBeParentAgreement: body.canBeParentAgreement ?? false,
      requiresParentAgreement: body.requiresParentAgreement ?? false,
    });

    if (result.error || !result.type) {
      return NextResponse.json(
        { error: result.error ?? "Unable to create contract type." },
        { status: 400 },
      );
    }

    return NextResponse.json({ contractType: result.type }, { status: 201 });
  } catch (error) {
    reportError(error, { route: "POST /api/admin/contract-types" });
    return NextResponse.json(
      { error: "Unable to create contract type." },
      { status: 500 },
    );
  }
}
