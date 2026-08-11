import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { mapContractWorkflowActionError } from "@/lib/contract-approval-errors";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { rejectAndPersist } from "@/lib/contract-persistence";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { reportError } from "@/lib/error-reporting";
import { getUserDisplayName } from "@/lib/user-display-name";

function sendNotificationEmail(
  to: string,
  subject: string,
  body: string,
): void {
  console.info(`email would be sent to ${to}`, { subject, body });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const approverEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const approverName = getUserDisplayName(user);

  if (!approverEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

    let note: string | undefined;

    try {
      const body = (await request.json()) as { note?: string };
      note = body.note?.trim() || undefined;
    } catch {
      note = undefined;
    }

    const record = await rejectAndPersist(
      id,
      organizationId,
      approverEmail,
      approverName,
      note,
    );

    try {
      await writeAuditLog({
        organizationId,
        entityType: "contract",
        entityId: record.id,
        action: "contract_step_rejected",
        actorEmail: approverEmail,
        actorName: approverName,
        detail: `Rejected contract ${record.recordNumber}.`,
        metadata: {
          note: note ?? null,
          stage: record.stage,
        },
      });
    } catch (auditError) {
      console.error("Failed to record contract rejection audit log:", auditError);
    }

    sendNotificationEmail(
      record.requesterEmail,
      `Contract rejected: ${record.title}`,
      [
        `Hello ${record.requesterName},`,
        "",
        `Your contract request ${record.recordNumber} (${record.title}) was rejected during approval.`,
        note ? `Reason: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    return NextResponse.json(record);
  } catch (error) {
    const mapped = mapContractWorkflowActionError(error);

    if (mapped) {
      return mapped;
    }

    reportError(error, { route: "POST /api/contracts/[id]/reject" });
    return NextResponse.json(
      { error: "Failed to reject contract" },
      { status: 500 },
    );
  }
}
