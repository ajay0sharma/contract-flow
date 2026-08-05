import { NextRequest, NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { requireAdminOrganizationId } from "@/lib/organization-context";
import { getAllUsers } from "@/lib/directory-sync";
import {
  requireAdminActor,
  requirePrivilegedActor,
} from "@/lib/directory-route-utils";
import { reportError } from "@/lib/error-reporting";

function parseActiveOnly(value: string | null): boolean {
  if (value == null) {
    return true;
  }

  return value.trim().toLowerCase() !== "false";
}

async function resolveDirectoryOrganizationId(
  request: NextRequest,
): Promise<string | NextResponse> {
  const adminAuth = await requireAdminActor();

  if ("response" in adminAuth) {
    return resolveClauseLibraryOrganizationId();
  }

  const organizationId = await requireAdminOrganizationId(
    adminAuth.actorEmail,
    request,
  );

  if (organizationId instanceof NextResponse) {
    return organizationId;
  }

  return organizationId;
}

export async function GET(request: NextRequest) {
  const auth = await requirePrivilegedActor();

  if ("response" in auth) {
    return auth.response;
  }

  const department = request.nextUrl.searchParams.get("department")?.trim();
  const activeOnly = parseActiveOnly(
    request.nextUrl.searchParams.get("activeOnly"),
  );

  try {
    const organizationId = await resolveDirectoryOrganizationId(request);

    if (organizationId instanceof NextResponse) {
      return organizationId;
    }

    let users = await getAllUsers(organizationId, activeOnly);

    if (department) {
      users = users.filter(
        (user) =>
          user.department?.trim().toLowerCase() === department.toLowerCase(),
      );
    }

    return NextResponse.json(users);
  } catch (error) {
    reportError(error, { route: "GET /api/directory/users" });
    return NextResponse.json(
      { error: "Failed to load directory users." },
      { status: 500 },
    );
  }
}
