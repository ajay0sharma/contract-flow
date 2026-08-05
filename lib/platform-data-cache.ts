import type { CounterpartyProfile } from "@/lib/counterparty-store";
import type { PlatformUser } from "@/lib/platform-config";
import type { WorkflowConfig, WorkflowPolicy } from "@/lib/workflow-config-types";

const globalCache = globalThis as typeof globalThis & {
  __platformUsersCache?: PlatformUser[];
  __workflowConfigCache?: Map<string, WorkflowConfig>;
  __workflowPolicyCache?: Map<string, WorkflowPolicy>;
  __counterpartiesCache?: Map<string, CounterpartyProfile[]>;
  __platformDataHydrated?: boolean;
};

export function isPlatformDataHydrated(): boolean {
  return Boolean(globalCache.__platformDataHydrated);
}

export function markPlatformDataHydrated(): void {
  globalCache.__platformDataHydrated = true;
}

export function getCachedPlatformUsers(): PlatformUser[] | undefined {
  return globalCache.__platformUsersCache;
}

export function setCachedPlatformUsers(users: PlatformUser[]): void {
  globalCache.__platformUsersCache = users;
}

function ensureWorkflowConfigCache(): Map<string, WorkflowConfig> {
  if (!globalCache.__workflowConfigCache) {
    globalCache.__workflowConfigCache = new Map();
  }

  return globalCache.__workflowConfigCache;
}

function ensureWorkflowPolicyCache(): Map<string, WorkflowPolicy> {
  if (!globalCache.__workflowPolicyCache) {
    globalCache.__workflowPolicyCache = new Map();
  }

  return globalCache.__workflowPolicyCache;
}

export function getCachedWorkflowConfig(
  organizationId: string,
): WorkflowConfig | undefined {
  return ensureWorkflowConfigCache().get(organizationId);
}

export function setCachedWorkflowConfig(
  organizationId: string,
  config: WorkflowConfig,
): void {
  ensureWorkflowConfigCache().set(organizationId, config);
}

export function getCachedWorkflowPolicy(
  organizationId: string,
): WorkflowPolicy | undefined {
  return ensureWorkflowPolicyCache().get(organizationId);
}

export function setCachedWorkflowPolicy(
  organizationId: string,
  policy: WorkflowPolicy,
): void {
  ensureWorkflowPolicyCache().set(organizationId, policy);
}

export function getCachedCounterparties(
  organizationId: string,
): CounterpartyProfile[] | undefined {
  return globalCache.__counterpartiesCache?.get(organizationId);
}

export function setCachedCounterparties(
  organizationId: string,
  counterparties: CounterpartyProfile[],
): void {
  if (!globalCache.__counterpartiesCache) {
    globalCache.__counterpartiesCache = new Map();
  }

  globalCache.__counterpartiesCache.set(organizationId, counterparties);
}

export function invalidateCounterpartyCache(organizationId?: string): void {
  if (!globalCache.__counterpartiesCache) {
    return;
  }

  if (organizationId) {
    globalCache.__counterpartiesCache.delete(organizationId);
    return;
  }

  globalCache.__counterpartiesCache.clear();
}

export function invalidateWorkflowCache(organizationId?: string): void {
  if (organizationId) {
    ensureWorkflowConfigCache().delete(organizationId);
    ensureWorkflowPolicyCache().delete(organizationId);
    return;
  }

  globalCache.__workflowConfigCache?.clear();
  globalCache.__workflowPolicyCache?.clear();
}
