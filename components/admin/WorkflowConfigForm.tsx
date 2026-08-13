"use client";

import { useMemo, useState, useTransition } from "react";
import { saveWorkflowConfigAction } from "@/app/actions/admin";
import { PeoplePicker } from "@/components/shared/PeoplePicker";
import { getCompanyConfig } from "@/lib/company-config";
import type {
  ContractTypeWorkflowRule,
  WorkflowConfig,
  WorkflowStepDefinition,
} from "@/lib/workflow-config-types";
import {
  createCustomWorkflowStep,
  isBuiltInWorkflowStepId,
  WORKFLOW_STAGE_OPTIONS,
} from "@/lib/workflow-config-types";
import type { ContractTypeRecord } from "@/types/contract-template";

interface WorkflowConfigFormProps {
  initialConfig: WorkflowConfig;
  organizationId: string;
  contractTypes: ContractTypeRecord[];
}

function findTypeRule(
  rules: ContractTypeWorkflowRule[],
  slug: string,
): ContractTypeWorkflowRule | undefined {
  return rules.find((rule) => rule.contractTypeSlug === slug);
}

export function WorkflowConfigForm({
  initialConfig,
  organizationId,
  contractTypes,
}: WorkflowConfigFormProps) {
  const [config, setConfig] = useState(initialConfig);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeContractTypes = useMemo(
    () =>
      [...contractTypes]
        .filter((type) => type.isActive)
        .sort((left, right) => left.label.localeCompare(right.label)),
    [contractTypes],
  );
  const organizationName = getCompanyConfig(organizationId).name;

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
    field: keyof Pick<
      WorkflowStepDefinition,
      "assigneeEmail" | "assigneeName" | "name" | "role" | "stage"
    >,
    value: string,
  ) {
    setConfig((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === stepId ? { ...step, [field]: value } : step,
      ),
    }));
  }

  function updateCustomStepMinAmount(stepId: string, value: string) {
    setConfig((current) => ({
      ...current,
      steps: current.steps.map((step) => {
        if (step.id !== stepId) {
          return step;
        }

        const trimmed = value.trim();

        return {
          ...step,
          minAmount: trimmed ? Number(trimmed) : undefined,
        };
      }),
    }));
  }

  function addApprovalStep() {
    setError(null);
    setConfig((current) => ({
      ...current,
      steps: [...current.steps, createCustomWorkflowStep()],
    }));
  }

  function removeApprovalStep(stepId: string) {
    if (config.steps.length <= 1) {
      setError("At least one approver step is required in the approval chain.");
      return;
    }

    const step = config.steps.find((entry) => entry.id === stepId);

    if (
      step?.id === "legal" &&
      !window.confirm(
        "Remove the legal review step? New contracts will no longer route to legal first unless you add another legal review step.",
      )
    ) {
      return;
    }

    setError(null);
    setConfig((current) => ({
      ...current,
      steps: current.steps.filter((entry) => entry.id !== stepId),
      contractTypeWorkflowRules: current.contractTypeWorkflowRules.map(
        (rule) => ({
          ...rule,
          disabledStepIds: rule.disabledStepIds.filter((id) => id !== stepId),
        }),
      ),
    }));
  }

  function upsertTypeRule(
    type: ContractTypeRecord,
    updater: (rule: ContractTypeWorkflowRule) => ContractTypeWorkflowRule,
  ) {
    setConfig((current) => {
      const existing = findTypeRule(
        current.contractTypeWorkflowRules,
        type.slug,
      );

      if (existing) {
        return {
          ...current,
          contractTypeWorkflowRules: current.contractTypeWorkflowRules.map(
            (rule) =>
              rule.contractTypeSlug === type.slug ? updater(rule) : rule,
          ),
        };
      }

      return {
        ...current,
        contractTypeWorkflowRules: [
          ...current.contractTypeWorkflowRules,
          updater({
            contractTypeSlug: type.slug,
            contractTypeLabel: type.label,
            disabledStepIds: [],
            routingRuleOverrides: {},
          }),
        ],
      };
    });
  }

  function isStepEnabledForType(typeSlug: string, stepId: string): boolean {
    const rule = findTypeRule(config.contractTypeWorkflowRules, typeSlug);
    return !rule?.disabledStepIds.includes(stepId);
  }

  function toggleStepForType(
    type: ContractTypeRecord,
    stepId: string,
    enabled: boolean,
  ) {
    upsertTypeRule(type, (rule) => {
      const disabled = new Set(rule.disabledStepIds);

      if (enabled) {
        disabled.delete(stepId);
      } else {
        disabled.add(stepId);
      }

      return {
        ...rule,
        contractTypeLabel: type.label,
        disabledStepIds: [...disabled],
      };
    });
  }

  function updateTypeThresholdOverride(
    type: ContractTypeRecord,
    ruleId: string,
    value: string,
  ) {
    upsertTypeRule(type, (rule) => {
      const nextOverrides = { ...rule.routingRuleOverrides };
      const trimmed = value.trim();

      if (!trimmed) {
        delete nextOverrides[ruleId];
      } else {
        nextOverrides[ruleId] = Number(trimmed);
      }

      return {
        ...rule,
        contractTypeLabel: type.label,
        routingRuleOverrides: nextOverrides,
      };
    });
  }

  function resetTypeRule(typeSlug: string) {
    setConfig((current) => ({
      ...current,
      contractTypeWorkflowRules: current.contractTypeWorkflowRules.filter(
        (rule) => rule.contractTypeSlug !== typeSlug,
      ),
    }));
  }

  function hasCustomTypeRule(typeSlug: string): boolean {
    return Boolean(findTypeRule(config.contractTypeWorkflowRules, typeSlug));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (config.steps.length === 0) {
      setError("Add at least one approver to the approval chain.");
      return;
    }

    startTransition(async () => {
      try {
        await saveWorkflowConfigAction(config, organizationId);
        setMessage(
          `Workflow settings saved for ${organizationName}. Contract records submitted under this company profile will use this approval chain.`,
        );
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
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Editing workflow for {organizationName}</p>
        <p className="mt-1">
          Approval chains are configured per company profile. Intake submissions
          use the workflow for the company profile selected on the request form.
          Switch client organization in the admin header before saving if you
          need to update another profile&apos;s workflow.
        </p>
      </div>
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
          Default amount thresholds that add department VP, finance, and
          executive approval steps. Contract-type overrides can change these
          below.
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
          Contract type workflow rules
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Adjust the approval chain and amount thresholds for specific contract
          types. Contracts without a custom rule use the default workflow
          above.
        </p>

        {activeContractTypes.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-stone-300 px-4 py-4 text-sm text-stone-600">
            Add contract types in the{" "}
            <a
              href="/admin/dashboard?section=contract-types"
              className="font-medium text-stone-900 underline"
            >
              Contract types
            </a>{" "}
            section before configuring type-specific workflow rules.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {activeContractTypes.map((type) => {
              const typeRule = findTypeRule(
                config.contractTypeWorkflowRules,
                type.slug,
              );

              return (
                <div
                  key={type.slug}
                  className="rounded-md border border-stone-200 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">{type.label}</p>
                      {type.description ? (
                        <p className="mt-1 text-sm text-stone-600">
                          {type.description}
                        </p>
                      ) : null}
                    </div>
                    {hasCustomTypeRule(type.slug) ? (
                      <button
                        type="button"
                        onClick={() => resetTypeRule(type.slug)}
                        className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                      >
                        Reset to default
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-medium text-stone-700">
                      Approval steps
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {config.steps.map((step) => (
                        <label
                          key={`${type.slug}-${step.id}`}
                          className="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-800"
                        >
                          <input
                            type="checkbox"
                            checked={isStepEnabledForType(type.slug, step.id)}
                            onChange={(event) =>
                              toggleStepForType(
                                type,
                                step.id,
                                event.target.checked,
                              )
                            }
                          />
                          <span>{step.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-medium text-stone-700">
                      Threshold overrides (optional)
                    </p>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      {config.routingRules.map((rule) => (
                        <label
                          key={`${type.slug}-${rule.id}`}
                          className="block text-sm"
                        >
                          <span className="font-medium text-stone-700">
                            {rule.label}
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            placeholder={`Default ${rule.threshold?.toLocaleString() ?? "0"}`}
                            value={
                              typeRule?.routingRuleOverrides[rule.id] ?? ""
                            }
                            onChange={(event) =>
                              updateTypeThresholdOverride(
                                type,
                                rule.id,
                                event.target.value,
                              )
                            }
                            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              Approval chain
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Default sequential approvers executed after contract intake. Add
              custom approvers or remove steps you do not need.
            </p>
          </div>
          <button
            type="button"
            onClick={addApprovalStep}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Add approver
          </button>
        </div>
        <ol className="mt-4 space-y-4">
          {config.steps.map((step, index) => {
            const isCustomStep = !isBuiltInWorkflowStepId(step.id);

            return (
            <li
              key={step.id}
              className="rounded-md border border-stone-200 px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-sm font-medium text-stone-500">
                  Step {index + 1} · {step.role}
                  {step.minAmount
                    ? ` · Applies at $${step.minAmount.toLocaleString()}+`
                    : " · Always required"}
                  {isCustomStep ? " · Custom approver" : " · Built-in step"}
                </p>
                <button
                  type="button"
                  onClick={() => removeApprovalStep(step.id)}
                  className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  Remove
                </button>
              </div>
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
                {isCustomStep ? (
                  <label className="block text-sm">
                    <span className="font-medium text-stone-700">Role label</span>
                    <input
                      type="text"
                      value={step.role}
                      onChange={(event) =>
                        updateStep(step.id, "role", event.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
                    />
                  </label>
                ) : null}
                {step.id === "department-vp" ? (
                  <p className="text-sm text-stone-600 md:col-span-2">
                    Assignee is resolved from the department VP approvers section
                    using the requester&apos;s department.
                  </p>
                ) : (
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
                )}
              </div>
              {isCustomStep ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium text-stone-700">
                      Workflow stage
                    </span>
                    <select
                      value={step.stage}
                      onChange={(event) =>
                        updateStep(step.id, "stage", event.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
                    >
                      {WORKFLOW_STAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-stone-700">
                      Minimum amount ($)
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      placeholder="Always required"
                      value={step.minAmount ?? ""}
                      onChange={(event) =>
                        updateCustomStepMinAmount(step.id, event.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900"
                    />
                  </label>
                </div>
              ) : null}
            </li>
            );
          })}
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
