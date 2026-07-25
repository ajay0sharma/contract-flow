"use client";

import { useState, useTransition } from "react";
import { saveWorkflowPolicyAction } from "@/app/actions/admin";
import type { WorkflowPolicy } from "@/lib/workflow-config-types";

interface WorkflowPolicyFormProps {
  initialPolicy: WorkflowPolicy;
}

const policyFields: Array<{
  key: keyof WorkflowPolicy;
  label: string;
  description: string;
}> = [
  {
    key: "requireAllApprovers",
    label: "Require all approvers",
    description:
      "Every step in the approval chain must complete before the contract advances.",
  },
  {
    key: "notifyAssigneesByEmail",
    label: "Notify assignees by email",
    description:
      "Send email notifications when a contract is routed to an approver.",
  },
  {
    key: "allowParallelApprovals",
    label: "Allow parallel approvals",
    description:
      "When enabled, multiple approval steps can be active at the same time.",
  },
  {
    key: "autoActivateAfterFinalApproval",
    label: "Auto-activate after final approval",
    description:
      "Move contracts to Active automatically once the last approval is recorded.",
  },
];

export function WorkflowPolicyForm({ initialPolicy }: WorkflowPolicyFormProps) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleField(key: keyof WorkflowPolicy) {
    setPolicy((current) => ({ ...current, [key]: !current[key] }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        await saveWorkflowPolicyAction(policy);
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
