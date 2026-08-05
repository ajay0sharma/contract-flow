import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrganizationId } from "@/lib/organization-context";
import { getAllDepartments } from "@/lib/directory-sync";
import { requireAuthenticatedActor } from "@/lib/directory-route-utils";
import { reportError } from "@/lib/error-reporting";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const organizationId = await requireAdminOrganizationId(
      auth.actorEmail,
      request,
    );

    if (organizationId instanceof NextResponse) {
      return organizationId;
    }

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
