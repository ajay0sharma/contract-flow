import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  getOrganizationBranding,
  toOrganizationBrandingView,
} from "@/lib/organization-branding-store";
import { reportError } from "@/lib/error-reporting";

export async function GET() {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const branding = await getOrganizationBranding(organizationId);
    const view = await toOrganizationBrandingView(branding);

    return NextResponse.json({ branding: view });
  } catch (error) {
    reportError(error, { route: "GET /api/branding" });
    return NextResponse.json(
      { error: "Failed to load organization branding." },
      { status: 500 },
    );
  }
}
