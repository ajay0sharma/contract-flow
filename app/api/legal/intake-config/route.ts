import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  getIntakeConfiguration,
  saveIntakeConfiguration,
} from "@/lib/intake-config-store";
import { reportError } from "@/lib/error-reporting";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import type {
  IntakeConfigTemplateUpdate,
  IntakeConfigTypeUpdate,
} from "@/types/contract-template";

export async function GET() {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const configuration = await getIntakeConfiguration();
    return NextResponse.json(configuration);
  } catch (error) {
    reportError(error, { route: "GET /api/legal/intake-config" });
    return NextResponse.json(
      { error: "Failed to load intake configuration." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  let body: {
    organizationId?: string;
    contractTypes?: IntakeConfigTypeUpdate[];
    templates?: IntakeConfigTemplateUpdate[];
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const organizationId = resolveClauseLibraryOrganizationId(body.organizationId);
  const contractTypes = Array.isArray(body.contractTypes) ? body.contractTypes : [];
  const templates = Array.isArray(body.templates) ? body.templates : [];

  try {
    const result = await saveIntakeConfiguration({
      organizationId,
      contractTypes,
      templates,
      actorEmail: auth.actor.email,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const configuration = await getIntakeConfiguration(organizationId);
    return NextResponse.json(configuration);
  } catch (error) {
    reportError(error, { route: "PUT /api/legal/intake-config" });
    return NextResponse.json(
      { error: "Failed to save intake configuration." },
      { status: 500 },
    );
  }
}
