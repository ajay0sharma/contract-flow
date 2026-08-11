import type { WorkflowPolicy } from "@/lib/workflow-config-types";
import { defaultWorkflowPolicy } from "@/lib/workflow-config-types";
import { DEFAULT_ORGANIZATION_ID } from "@/types/clause-library";

const ALLOWED_REMINDER_DAYS = [1, 3, 7, 14] as const;

function normalizeReminderDays(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [...defaultWorkflowPolicy.approvalReminderDays];
  }

  const days = value
    .map((entry) => Number.parseInt(String(entry), 10))
    .filter(
      (entry) =>
        Number.isFinite(entry) &&
        ALLOWED_REMINDER_DAYS.includes(entry as (typeof ALLOWED_REMINDER_DAYS)[number]),
    );

  return days.length > 0
    ? [...new Set(days)].sort((a, b) => a - b)
    : [...defaultWorkflowPolicy.approvalReminderDays];
}

export function normalizeWorkflowPolicy(value: unknown): WorkflowPolicy {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<WorkflowPolicy>)
      : {};

  const escalateAfterDays = Number.parseInt(
    String(source.escalateAfterDays ?? defaultWorkflowPolicy.escalateAfterDays),
    10,
  );

  return {
    requireAllApprovers:
      source.requireAllApprovers ??
      defaultWorkflowPolicy.requireAllApprovers,
    notifyAssigneesByEmail:
      source.notifyAssigneesByEmail ??
      defaultWorkflowPolicy.notifyAssigneesByEmail,
    allowParallelApprovals:
      source.allowParallelApprovals ??
      defaultWorkflowPolicy.allowParallelApprovals,
    autoActivateAfterFinalApproval:
      source.autoActivateAfterFinalApproval ??
      defaultWorkflowPolicy.autoActivateAfterFinalApproval,
    approvalReminderDays: normalizeReminderDays(source.approvalReminderDays),
    escalateAfterDays: Number.isFinite(escalateAfterDays)
      ? Math.max(0, escalateAfterDays)
      : defaultWorkflowPolicy.escalateAfterDays,
    escalationContactEmail:
      typeof source.escalationContactEmail === "string"
        ? source.escalationContactEmail.trim()
        : defaultWorkflowPolicy.escalationContactEmail,
    notifyEscalationContact:
      source.notifyEscalationContact ??
      defaultWorkflowPolicy.notifyEscalationContact,
  };
}

export function resolveOrganizationPolicyId(
  organizationId?: string | null,
): string {
  return organizationId?.trim() || DEFAULT_ORGANIZATION_ID;
}
