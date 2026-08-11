"use client";

import { useState, useTransition } from "react";
import { saveWorkflowPolicyAction } from "@/app/actions/admin";
import type { WorkflowPolicy } from "@/lib/workflow-config-types";

interface WorkflowPolicyFormProps {
  initialPolicy: WorkflowPolicy;
  organizationId: string;
}

const policyFields: Array<{
  key: keyof Pick<
    WorkflowPolicy,
    | "requireAllApprovers"
    | "notifyAssigneesByEmail"
    | "allowParallelApprovals"
    | "autoActivateAfterFinalApproval"
    | "notifyEscalationContact"
  >;
  label: string;
  description: string;
}> = [
  {
    key: "requireAllApprovers",
    label: "Require all approvers",
    description:
      "In parallel mode, every active approval must complete before the contract advances. When disabled, the first completed approval can finalize the workflow.",
  },
  {
    key: "notifyAssigneesByEmail",
    label: "Notify assignees by email",
    description:
      "Send email notifications when a contract is routed to an approver, approved, rejected, or escalated.",
  },
  {
    key: "allowParallelApprovals",
    label: "Allow parallel approvals",
    description:
      "When enabled, all approval steps become active at intake so approvers can review concurrently.",
  },
  {
    key: "autoActivateAfterFinalApproval",
    label: "Auto-activate after final approval",
    description:
      "Move contracts to Active automatically once the last approval is recorded.",
  },
  {
    key: "notifyEscalationContact",
    label: "Notify escalation contact",
    description:
      "Include the escalation contact on overdue approval escalation emails.",
  },
];

export function WorkflowPolicyForm({
  initialPolicy,
  organizationId,
}: WorkflowPolicyFormProps) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleField(
    key: keyof Pick<
      WorkflowPolicy,
      | "requireAllApprovers"
      | "notifyAssigneesByEmail"
      | "allowParallelApprovals"
      | "autoActivateAfterFinalApproval"
      | "notifyEscalationContact"
    >,
  ) {
    setPolicy((current) => ({ ...current, [key]: !current[key] }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        await saveWorkflowPolicyAction(policy, organizationId);
        setMessage("Workflow policies saved.");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to save workflow policies.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          Platform workflow policy
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          These settings govern how approvals behave across all contract
          requests.
        </p>

        <ul className="mt-6 space-y-4">
          {policyFields.map((field) => (
            <li
              key={field.key}
              className="flex items-start gap-3 rounded-md border border-stone-200 px-4 py-4"
            >
              <input
                id={field.key}
                type="checkbox"
                checked={policy[field.key]}
                onChange={() => toggleField(field.key)}
                className="mt-1 h-4 w-4 rounded border-stone-300"
              />
              <label htmlFor={field.key} className="text-sm">
                <span className="font-medium text-stone-900">{field.label}</span>
                <span className="mt-1 block text-stone-600">
                  {field.description}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          Approval reminders and escalation
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Overdue approvals trigger reminder emails and optional escalation to a
          backup contact.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-stone-900">
              Reminder days while waiting
            </span>
            <input
              type="text"
              value={policy.approvalReminderDays.join(", ")}
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  approvalReminderDays: event.target.value
                    .split(",")
                    .map((value) => Number.parseInt(value.trim(), 10))
                    .filter(
                      (value) =>
                        Number.isFinite(value) && [1, 3, 7, 14].includes(value),
                    ),
                }))
              }
              className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2"
              placeholder="1, 3, 7"
            />
            <span className="mt-1 block text-xs text-stone-500">
              Comma-separated day counts (1, 3, 7, or 14) after a step becomes
              active.
            </span>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-stone-900">Escalate after days</span>
            <input
              type="number"
              min={0}
              value={policy.escalateAfterDays}
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  escalateAfterDays: Math.max(
                    0,
                    Number.parseInt(event.target.value, 10) || 0,
                  ),
                }))
              }
              className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-stone-500">
              Set to 0 to disable automatic escalation.
            </span>
          </label>

          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-stone-900">Escalation contact email</span>
            <input
              type="email"
              value={policy.escalationContactEmail}
              onChange={(event) =>
                setPolicy((current) => ({
                  ...current,
                  escalationContactEmail: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2"
              placeholder="legal-escalations@company.com"
            />
          </label>
        </div>
      </section>

      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save policies"}
      </button>
    </form>
  );
}
