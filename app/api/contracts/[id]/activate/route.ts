import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  loadContractRecord,
  saveContractRecord,
} from "@/lib/contract-persistence";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";
import { activateContract } from "@/lib/workflow-engine";

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
    const existing = await loadContractRecord(id, organizationId);

    if (!existing) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const record = activateContract(existing, actorName, actorEmail);
    await saveContractRecord(record);

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: record.id,
      action: "contract_activated",
      actorEmail,
      actorName,
      detail: `Activated contract ${record.recordNumber}.`,
    });

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not awaiting signature")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    reportError(error, { route: "POST /api/contracts/[id]/activate" });
    return NextResponse.json(
      { error: "Failed to activate contract" },
      { status: 500 },
    );
  }
}
