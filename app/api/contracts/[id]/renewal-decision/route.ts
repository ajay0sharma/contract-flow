import { NextRequest, NextResponse } from "next/server";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { reportError } from "@/lib/error-reporting";
import { updateRenewalDecisionAndPersist } from "@/lib/renewal-service";

export async function POST(
  request: NextRequest,
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

    const body = (await request.json()) as {
      decision?: "non_renewing" | "renewed";
      note?: string;
    };

    if (body.decision !== "non_renewing" && body.decision !== "renewed") {
      return NextResponse.json(
        { error: "Select a renewal decision." },
        { status: 400 },
      );
    }

    const record = await updateRenewalDecisionAndPersist(
      id,
      organizationId,
      body.decision,
      auth.actor,
      body.note?.trim() || undefined,
    );

    try {
      await writeAuditLog({
        organizationId,
        entityType: "contract",
        entityId: record.id,
        action:
          body.decision === "non_renewing"
            ? "renewal_marked_non_renewing"
            : "renewal_marked_renewed",
        actorEmail: auth.actor.email,
        actorName: auth.actor.name,
        detail: `Updated renewal decision for ${record.recordNumber}.`,
        metadata: {
          decision: body.decision,
          note: body.note?.trim() || null,
        },
      });
    } catch (auditError) {
      console.error("Failed to record renewal decision audit log:", auditError);
    }

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    reportError(error, { route: "POST /api/contracts/[id]/renewal-decision" });
    return NextResponse.json(
      { error: "Failed to update renewal decision." },
      { status: 500 },
    );
  }
}
