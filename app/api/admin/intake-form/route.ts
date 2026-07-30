import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { requireAdminActor } from "@/lib/directory-route-utils";
import { reportError } from "@/lib/error-reporting";
import {
  ensureDefaultIntakeForm,
  getActiveIntakeForm,
  resetIntakeFormToDefaults,
  saveIntakeForm,
} from "@/lib/intake-form-store";
import type { SaveIntakeFormInput } from "@/types/intake-form";

export async function GET() {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const intakeForm =
    (await getActiveIntakeForm(organizationId)) ??
    (await ensureDefaultIntakeForm(organizationId));

  return NextResponse.json({ intakeForm, organizationId });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    let body: SaveIntakeFormInput;

    try {
      body = (await request.json()) as SaveIntakeFormInput;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const organizationId = resolveClauseLibraryOrganizationId();

    if (!Array.isArray(body.sections)) {
      return NextResponse.json(
        { error: "Sections are required." },
        { status: 400 },
      );
    }

    for (const section of body.sections) {
      if (!section.label?.trim()) {
        return NextResponse.json(
          { error: "Each section must have a label." },
          { status: 400 },
        );
      }

      for (const field of section.fields ?? []) {
        if (!field.label?.trim()) {
          return NextResponse.json(
            { error: "Each field must have a label." },
            { status: 400 },
          );
        }
      }
    }

    const intakeForm = await saveIntakeForm({
      organizationId,
      name: body.name,
      sections: body.sections,
    });

    return NextResponse.json({ intakeForm });
  } catch (error) {
    reportError(error, { route: "PUT /api/admin/intake-form" });
    return NextResponse.json(
      { error: "Unable to save intake form configuration." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    let body: { action?: string };

    try {
      body = (await request.json()) as { action?: string };
    } catch {
      body = {};
    }

    if (body.action !== "reset") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const organizationId = resolveClauseLibraryOrganizationId();
    const intakeForm = await resetIntakeFormToDefaults(organizationId);

    return NextResponse.json({ intakeForm });
  } catch (error) {
    reportError(error, { route: "POST /api/admin/intake-form" });
    return NextResponse.json(
      { error: "Unable to reset intake form configuration." },
      { status: 500 },
    );
  }
}
