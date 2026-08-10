import type { WorkflowConfig } from "@/lib/workflow-config-types";
import { syncStepThresholds } from "@/lib/workflow-store-defaults";

function normalizeContractTypeKey(value: string): string {
  return value.trim().toLowerCase();
}

function findContractTypeWorkflowRule(
  config: WorkflowConfig,
  contractType?: string | null,
) {
  const normalizedType = normalizeContractTypeKey(contractType ?? "");

  if (!normalizedType) {
    return null;
  }

  return (
    config.contractTypeWorkflowRules.find((rule) => {
      return (
        normalizeContractTypeKey(rule.contractTypeLabel) === normalizedType ||
        normalizeContractTypeKey(rule.contractTypeSlug) === normalizedType
      );
    }) ?? null
  );
}

export function resolveWorkflowConfigForContractType(
  config: WorkflowConfig,
  contractType?: string | null,
): WorkflowConfig {
  const rule = findContractTypeWorkflowRule(config, contractType);

  if (!rule) {
    return config;
  }

  const resolved = structuredClone(config);

  if (Object.keys(rule.routingRuleOverrides).length > 0) {
    resolved.routingRules = resolved.routingRules.map((routingRule) => ({
      ...routingRule,
      threshold:
        rule.routingRuleOverrides[routingRule.id] ?? routingRule.threshold,
    }));
    syncStepThresholds(resolved);
  }

  if (rule.disabledStepIds.length > 0) {
    const disabled = new Set(rule.disabledStepIds);
    resolved.steps = resolved.steps.filter((step) => !disabled.has(step.id));
  }

  return resolved;
}

export function getContractTypeWorkflowRule(
  config: WorkflowConfig,
  contractType?: string | null,
) {
  return findContractTypeWorkflowRule(config, contractType);
}
