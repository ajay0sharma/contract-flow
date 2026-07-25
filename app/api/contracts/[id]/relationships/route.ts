import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { loadContractRelationships } from "@/lib/contract-relationships";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";

function isPrivilegedUser(email: string): boolean {
  return isLegalEmail(email) || isAdminEmail(email);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const organizationId = resolveClauseLibraryOrganizationId();

  if (!organizationId.trim()) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const record = await loadMergedContractRecord(id, organizationId);

    if (!record) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    if (!isPrivilegedUser(actorEmail)) {
      const isRequester =
        record.requesterEmail.trim().toLowerCase() === actorEmail.toLowerCase();

      if (!isRequester) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    const relationships = await loadContractRelationships(id, organizationId);

    if (!relationships) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    return NextResponse.json(relationships);
  } catch (error) {
    reportError(error, {
      route: "GET /api/contracts/[id]/relationships",
      contractId: id,
    });
    return NextResponse.json(
      { error: "Failed to load contract relationships" },
      { status: 500 },
    );
  }
}
