"use server";

import { currentUser } from "@clerk/nextjs/server";
import { recordContractAuditLog } from "@/lib/audit-log";
import { getUserDisplayName } from "@/lib/user-display-name";

export async function recordContractDraftGeneratedAction(input: {
  organizationId: string;
  contractId?: string;
  templateId: string;
  templateTitle: string;
  templateVersion: number;
}): Promise<void> {
  const user = await currentUser();

  if (!user) {
    return;
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";

  await recordContractAuditLog({
    organizationId: input.organizationId,
    entityId: input.contractId ?? input.templateId,
    action: "contract_draft_generated",
    detail: `Generated contract draft from template "${input.templateTitle}" (v${input.templateVersion}).`,
    actorEmail: email,
    actorName: getUserDisplayName(user),
    metadata: {
      templateId: input.templateId,
      templateVersion: input.templateVersion,
    },
  });
}
