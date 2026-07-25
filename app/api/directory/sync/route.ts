import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { syncDirectoryUsers } from "@/lib/directory-sync";
import { requireAdminActor } from "@/lib/directory-route-utils";
import { reportError } from "@/lib/error-reporting";

export async function POST() {
  const auth = await requireAdminActor();

  if ("response" in auth) {
    return auth.response;
  }

  const { actorEmail, actorName } = auth;

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const result = await syncDirectoryUsers(organizationId);

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: organizationId,
      action: "directory_synced",
      actorEmail,
      actorName,
      detail: result.success
        ? `Directory sync completed with ${result.totalUsers} users.`
        : `Directory sync failed: ${result.error ?? "Unknown error."}`,
      metadata: result,
    });

    return NextResponse.json(result);
  } catch (error) {
    reportError(error, { route: "POST /api/directory/sync" });
    return NextResponse.json(
      { error: "Failed to run directory sync." },
      { status: 500 },
    );
  }
}
