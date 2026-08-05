import type { CounterpartyProfile } from "@/lib/counterparty-store";
import type { PlatformUser } from "@/lib/platform-config";
import type { WorkflowConfig, WorkflowPolicy } from "@/lib/workflow-config-types";

const globalCache = globalThis as typeof globalThis & {
  __platformUsersCache?: PlatformUser[];
  __workflowConfigCache?: WorkflowConfig;
  __workflowPolicyCache?: WorkflowPolicy;
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

export function getCachedWorkflowConfig(): WorkflowConfig | undefined {
  return globalCache.__workflowConfigCache;
}

export function setCachedWorkflowConfig(config: WorkflowConfig): void {
  globalCache.__workflowConfigCache = config;
}

export function getCachedWorkflowPolicy(): WorkflowPolicy | undefined {
  return globalCache.__workflowPolicyCache;
}

export function setCachedWorkflowPolicy(policy: WorkflowPolicy): void {
  globalCache.__workflowPolicyCache = policy;
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
