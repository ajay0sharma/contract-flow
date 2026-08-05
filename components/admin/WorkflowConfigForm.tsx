"use client";

import { useState, useTransition } from "react";
import { saveWorkflowConfigAction } from "@/app/actions/admin";
import { PeoplePicker } from "@/components/shared/PeoplePicker";
import type { WorkflowConfig } from "@/lib/workflow-config-types";

interface WorkflowConfigFormProps {
  initialConfig: WorkflowConfig;
  organizationId: string;
}

export function WorkflowConfigForm({
  initialConfig,
  organizationId,
}: WorkflowConfigFormProps) {
  const [config, setConfig] = useState(initialConfig);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRuleThreshold(ruleId: string, threshold: number) {
    setConfig((current) => ({
      ...current,
      routingRules: current.routingRules.map((rule) =>
        rule.id === ruleId ? { ...rule, threshold } : rule,
      ),
    }));
  }

  function updateStepAssignee(
    stepId: string,
    user: { email: string; name: string } | null,
  ) {
    setConfig((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === stepId
          ? {
              ...step,
              assigneeName: user?.name ?? "",
              assigneeEmail: user?.email ?? "",
            }
          : step,
      ),
    }));
  }

  function updateVpApproverAssignee(
    department: string,
    user: { email: string; name: string } | null,
  ) {
    setConfig((current) => ({
      ...current,
      vpDepartmentApprovers: current.vpDepartmentApprovers.map((approver) =>
        approver.department === department
          ? {
              ...approver,
              assigneeName: user?.name ?? "",
              assigneeEmail: user?.email ?? "",
            }
          : approver,
      ),
    }));
  }

  function updateStep(
    stepId: string,
    field: "assigneeEmail" | "assigneeName" | "name",
    value: string,
  ) {
    setConfig((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === stepId ? { ...step, [field]: value } : step,
      ),
    }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        await saveWorkflowConfigAction(config, organizationId);
        setMessage("Workflow settings saved.");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to save workflow settings.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">General</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-stone-700">Workflow name</span>
            <input
              type="text"
              value={config.name}
              onChange={(event) =>
                setConfig((current) => ({ ...current, name: event.target.value }))
              }
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-stone-700">Description</span>
            <textarea
              value={config.description}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={3}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">Routing rules</h2>
        <p className="mt-1 text-sm text-stone-600">
          Amount thresholds that add department VP, finance, and executive
          approval steps.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {config.routingRules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-md border border-stone-200 px-4 py-4"
            >
              <p className="font-medium text-stone-900">{rule.label}</p>
              <p className="mt-1 text-sm text-stone-600">{rule.description}</p>
              <label className="mt-3 block text-sm">
                <span className="font-medium text-stone-700">Threshold ($)</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={rule.threshold ?? 0}
                  onChange={(event) =>
                    updateRuleThreshold(rule.id, Number(event.target.value))
                  }
                  className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          Department VP approvers
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          When the Department VP approval threshold is met, the contract routes
          to the VP assigned to the contract department.
        </p>
        <div className="mt-4 grid gap-4">
          {config.vpDepartmentApprovers.map((approver) => (
            <div
              key={approver.department}
              className="grid gap-3 rounded-md border border-stone-200 px-4 py-4 md:grid-cols-[1fr_2fr]"
            >
              <div>
                <p className="text-sm font-medium text-stone-900">
                  {approver.department}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Department selected on intake
                </p>
              </div>
              <div className="md:col-span-2">
                <PeoplePicker
                  label="VP assignee"
                  value={
                    approver.assigneeEmail.trim() || approver.assigneeName.trim()
                      ? {
                          email: approver.assigneeEmail,
                          name:
                            approver.assigneeName || approver.assigneeEmail,
                        }
                      : null
                  }
                  onChange={(user) =>
                    updateVpApproverAssignee(approver.department, user)
                  }
                  placeholder="Search by name or email..."
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          Parent and child agreement types
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Configure which contract types can serve as parent agreements and which
          require a parent link during intake from the{" "}
          <a
            href="/admin/dashboard?section=contract-types"
            className="font-medium text-stone-900 underline"
          >
            Contract types
          </a>{" "}
          section.
        </p>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">Approval chain</h2>
        <p className="mt-1 text-sm text-stone-600">
          Sequential steps executed after contract intake.
        </p>
        <ol className="mt-4 space-y-4">
          {config.steps.map((step, index) => (
            <li
              key={step.id}
              className="rounded-md border border-stone-200 px-4 py-4"
            >
              <p className="text-sm font-medium text-stone-500">
                Step {index + 1} · {step.role}
                {step.minAmount
                  ? ` · Applies at $${step.minAmount.toLocaleString()}+`
                  : " · Always required"}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="block text-sm">
                  <span className="font-medium text-stone-700">Step name</span>
                  <input
                    type="text"
                    value={step.name}
                    onChange={(event) =>
                      updateStep(step.id, "name", event.target.value)
                    }
                    className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="font-medium text-stone-700">Assignee</span>
                  <div className="mt-1">
                    <PeoplePicker
                      value={
                        step.assigneeEmail.trim() || step.assigneeName.trim()
                          ? {
                              email: step.assigneeEmail,
                              name: step.assigneeName || step.assigneeEmail,
                            }
                          : null
                      }
                      onChange={(user) => updateStepAssignee(step.id, user)}
                      placeholder="Search by name or email..."
                    />
                  </div>
                </label>
              </div>
            </li>
          ))}
        </ol>
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
        {isPending ? "Saving..." : "Save workflow settings"}
      </button>
    </form>
  );
}
