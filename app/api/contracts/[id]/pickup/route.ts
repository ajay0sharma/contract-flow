import { NextResponse } from "next/server";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { getLegalAssignableUsers } from "@/lib/access-control";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { assignLegalReviewerAndPersist } from "@/lib/contract-persistence";
import { reportError } from "@/lib/error-reporting";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { assignContractLegalReviewer } from "@/lib/contract-store";
import { isAwaitingLegalPickup } from "@/lib/legal-assignment";
import { loadMergedContractRecord } from "@/lib/contract-list-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const organizationId = await resolveContractOrganizationId(id);

    if (!organizationId) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const existing = await loadMergedContractRecord(id, organizationId);

    if (!existing) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    if (!isAwaitingLegalPickup(existing)) {
      return NextResponse.json(
        { error: "This contract is not awaiting legal pickup." },
        { status: 400 },
      );
    }

    const assignee = getLegalAssignableUsers().find(
      (user) => user.email.toLowerCase() === auth.actor.email.toLowerCase(),
    );

    if (!assignee) {
      return NextResponse.json(
        { error: "Your account is not configured as a legal reviewer." },
        { status: 403 },
      );
    }

    const record = allowMemoryPersistence()
      ? assignContractLegalReviewer(id, assignee, auth.actor)
      : await assignLegalReviewerAndPersist(
          id,
          organizationId,
          assignee,
          auth.actor,
        );

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    reportError(error, { route: "POST /api/contracts/[id]/pickup" });
    return NextResponse.json(
      { error: "Failed to pick up contract." },
      { status: 500 },
    );
  }
}
