import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrganizationId } from "@/lib/organization-context";
import { searchDirectoryUsers } from "@/lib/directory-sync";
import { reportError } from "@/lib/error-reporting";
import { requireAuthenticatedActor } from "@/lib/directory-route-utils";

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "10", 10);

  if (Number.isNaN(parsed)) {
    return 10;
  }

  return Math.min(Math.max(parsed, 1), 25);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedActor();

  if ("response" in auth) {
    return auth.response;
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  try {
    const organizationId = await requireAdminOrganizationId(
      auth.actorEmail,
      request,
    );

    if (organizationId instanceof NextResponse) {
      return organizationId;
    }

    const users = await searchDirectoryUsers(organizationId, query, limit);

    return NextResponse.json(
      users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        jobTitle: user.jobTitle,
        department: user.department,
        phone: user.phone,
      })),
    );
  } catch (error) {
    reportError(error, { route: "GET /api/directory/search", query });
    return NextResponse.json(
      { error: "Failed to search directory users." },
      { status: 500 },
    );
  }
}
