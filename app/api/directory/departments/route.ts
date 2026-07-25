import { NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { getAllDepartments } from "@/lib/directory-sync";
import { requireAuthenticatedActor } from "@/lib/directory-route-utils";
import { reportError } from "@/lib/error-reporting";

export async function GET() {
  const auth = await requireAuthenticatedActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const departments = await getAllDepartments(organizationId);

    return NextResponse.json(departments);
  } catch (error) {
    reportError(error, { route: "GET /api/directory/departments" });
    return NextResponse.json(
      { error: "Failed to load departments." },
      { status: 500 },
    );
  }
}
