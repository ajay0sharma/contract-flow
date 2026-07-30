import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  deleteContractType,
  updateContractType,
} from "@/lib/contract-type-store";
import { requireAdminActor } from "@/lib/directory-route-utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;

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
    const result = await updateContractType(id, organizationId, {
      label: body.label,
      description: body.description,
      canBeParentAgreement: body.canBeParentAgreement,
      requiresParentAgreement: body.requiresParentAgreement,
    });

    if (result.error || !result.type) {
      return NextResponse.json(
        { error: result.error ?? "Unable to update contract type." },
        { status: 400 },
      );
    }

    return NextResponse.json({ contractType: result.type });
  } catch {
    return NextResponse.json(
      { error: "Unable to update contract type." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const organizationId = resolveClauseLibraryOrganizationId();
    const result = await deleteContractType(id, organizationId);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      deleted: result.deleted ?? false,
      contractType: result.type ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to delete contract type." },
      { status: 500 },
    );
  }
}
