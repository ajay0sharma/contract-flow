import { NextResponse } from "next/server";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { reportError } from "@/lib/error-reporting";
import { startRenewalAndPersist } from "@/lib/renewal-service";

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

    const result = await startRenewalAndPersist(id, organizationId, auth.actor);

    try {
      await writeAuditLog({
        organizationId,
        entityType: "contract",
        entityId: result.source.id,
        action: "renewal_started",
        actorEmail: auth.actor.email,
        actorName: auth.actor.name,
        detail: `Started renewal ${result.renewal.recordNumber} from ${result.source.recordNumber}.`,
        metadata: {
          renewalContractId: result.renewal.id,
          renewalRecordNumber: result.renewal.recordNumber,
        },
      });
    } catch (auditError) {
      console.error("Failed to record renewal start audit log:", auditError);
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    reportError(error, { route: "POST /api/contracts/[id]/start-renewal" });
    return NextResponse.json(
      { error: "Failed to start renewal." },
      { status: 500 },
    );
  }
}
