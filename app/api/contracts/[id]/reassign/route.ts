import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import {
  loadContractRecord,
  reassignAndPersist,
} from "@/lib/contract-persistence";
import { sendContractReassignmentNotification } from "@/lib/contract-notifications";
import { reportError } from "@/lib/error-reporting";
import { isValidEmail } from "@/lib/person-display";
import { safeTrim } from "@/lib/string-utils";
import { getCurrentApprover } from "@/lib/workflow-engine";

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
    const organizationId = resolveClauseLibraryOrganizationId();
    const existing = await loadContractRecord(id, organizationId);

    if (!existing) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const previousApprover = getCurrentApprover(existing);
    const previousAssigneeEmail = previousApprover?.assigneeEmail ?? "";

    let body: {
      assigneeEmail?: string;
      assigneeName?: string;
      note?: string;
      targetAssigneeEmail?: string;
    };

    try {
      body = (await request.json()) as {
        assigneeEmail?: string;
        assigneeName?: string;
        note?: string;
        targetAssigneeEmail?: string;
      };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const assigneeEmail = safeTrim(body.assigneeEmail ?? "").toLowerCase();
    const assigneeName = safeTrim(body.assigneeName ?? "");
    const note = safeTrim(body.note ?? "") || undefined;
    const targetAssigneeEmail =
      safeTrim(body.targetAssigneeEmail ?? "").toLowerCase() || undefined;

    if (!assigneeEmail || !isValidEmail(assigneeEmail)) {
      return NextResponse.json(
        { error: "Select a valid assignee email." },
        { status: 400 },
      );
    }

    if (!assigneeName) {
      return NextResponse.json(
        { error: "Assignee name is required." },
        { status: 400 },
      );
    }

    const record = await reassignAndPersist(
      id,
      organizationId,
      { email: assigneeEmail, name: assigneeName },
      { email: auth.actor.email, name: auth.actor.name },
      note,
      targetAssigneeEmail,
    );

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: record.id,
      action: "contract_approval_reassigned",
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      detail: `Reassigned approval for contract ${record.recordNumber}.`,
      metadata: {
        previousAssigneeEmail: previousAssigneeEmail || null,
        newAssigneeEmail: assigneeEmail,
        newAssigneeName: assigneeName,
        note: note ?? null,
      },
    });

    await sendContractReassignmentNotification(record, previousAssigneeEmail);

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes("No pending approval step") ||
        error.message.includes("not awaiting approval") ||
        error.message.includes("already assigned")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    reportError(error, { route: "POST /api/contracts/[id]/reassign" });
    return NextResponse.json(
      { error: "Failed to reassign approval." },
      { status: 500 },
    );
  }
}
