import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrganizationActor } from "@/lib/admin-organization-api";
import {
  createContractType,
  listContractTypes,
} from "@/lib/contract-type-store";
import { reportError } from "@/lib/error-reporting";

export async function GET(request: NextRequest) {
  const auth = await requireAdminOrganizationActor(request);

  if ("response" in auth) {
    return auth.response;
  }

  const contractTypes = await listContractTypes(auth.organizationId, {
    includeInactive: true,
  });

  return NextResponse.json({
    contractTypes,
    organizationId: auth.organizationId,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrganizationActor(request);

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

    const result = await createContractType({
      organizationId: auth.organizationId,
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
