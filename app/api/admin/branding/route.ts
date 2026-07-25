import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { requireAdminActor } from "@/lib/directory-route-utils";
import {
  getOrganizationBranding,
  removeOrganizationBrandingLogo,
  toOrganizationBrandingView,
  updateOrganizationBranding,
  uploadOrganizationBrandingLogoFile,
} from "@/lib/organization-branding-store";
import { reportError } from "@/lib/error-reporting";

export async function GET() {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const branding = await getOrganizationBranding(organizationId);
    const view = await toOrganizationBrandingView(branding);

    return NextResponse.json({ branding: view, organizationId });
  } catch (error) {
    reportError(error, { route: "GET /api/admin/branding" });
    return NextResponse.json(
      { error: "Failed to load organization branding." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  let body: {
    productName?: string;
    tagline?: string | null;
    accentColor?: string | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const result = await updateOrganizationBranding(organizationId, {
      productName: body.productName,
      tagline: body.tagline,
      accentColor: body.accentColor,
      updatedById: auth.actorEmail,
    });

    if (result.error || !result.branding) {
      return NextResponse.json(
        { error: result.error ?? "Unable to save branding." },
        { status: 400 },
      );
    }

    const view = await toOrganizationBrandingView(result.branding);
    return NextResponse.json({ branding: view });
  } catch (error) {
    reportError(error, { route: "PUT /api/admin/branding" });
    return NextResponse.json(
      { error: "Failed to save organization branding." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const action = String(formData.get("action") ?? "upload");

  try {
    const organizationId = resolveClauseLibraryOrganizationId();

    if (action === "remove-logo") {
      const result = await removeOrganizationBrandingLogo(
        organizationId,
        auth.actorEmail,
      );

      if (result.error || !result.branding) {
        return NextResponse.json(
          { error: result.error ?? "Unable to remove logo." },
          { status: 400 },
        );
      }

      const view = await toOrganizationBrandingView(result.branding);
      return NextResponse.json({ branding: view });
    }

    const file = formData.get("logo");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Choose a logo file to upload." },
        { status: 400 },
      );
    }

    const result = await uploadOrganizationBrandingLogoFile(
      organizationId,
      file,
      auth.actorEmail,
    );

    if (result.error || !result.branding) {
      return NextResponse.json(
        { error: result.error ?? "Unable to upload logo." },
        { status: 400 },
      );
    }

    const view = await toOrganizationBrandingView(result.branding);
    return NextResponse.json({ branding: view });
  } catch (error) {
    reportError(error, { route: "POST /api/admin/branding" });
    return NextResponse.json(
      { error: "Failed to update organization logo." },
      { status: 500 },
    );
  }
}
