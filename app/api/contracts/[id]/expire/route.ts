import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { markContractExpired } from "@/lib/contract-persistence";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";

function isPrivilegedUser(email: string): boolean {
  return isLegalEmail(email) || isAdminEmail(email);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const actorName = getUserDisplayName(user);

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isPrivilegedUser(actorEmail)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const organizationId = resolveClauseLibraryOrganizationId();
    const record = await markContractExpired(
      id,
      organizationId,
      actorName,
      actorEmail,
    );

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: id,
      action: "contract_expired",
      actorEmail,
      actorName,
      detail: `Expired contract ${record.recordNumber}.`,
    });

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Contract not found.") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error.message === "Only active contracts can be marked expired.") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }

    reportError(error, { route: "POST /api/contracts/[id]/expire" });
    return NextResponse.json(
      { error: "Failed to expire contract." },
      { status: 500 },
    );
  }
}
