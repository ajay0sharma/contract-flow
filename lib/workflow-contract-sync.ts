import {
  loadContractRecord,
  saveContractRecord,
} from "@/lib/contract-persistence";
import { getPrismaClient } from "@/lib/prisma";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { ContractRecord } from "@/types/contract";
import {
  contractWorkflowNeedsSync,
  reconcileContractWorkflowWithConfig,
  shouldSyncContractWorkflow,
} from "@/lib/workflow-contract-reconcile";

const LEGACY_ORGANIZATION_IDS = ["seed-org-001"] as const;

function resolveOrganizationIds(organizationId: string): string[] {
  return [organizationId, ...LEGACY_ORGANIZATION_IDS];
}

export {
  contractWorkflowNeedsSync,
  reconcileContractWorkflowWithConfig,
  shouldSyncContractWorkflow,
} from "@/lib/workflow-contract-reconcile";

async function persistReconciledContract(
  contract: ContractRecord,
): Promise<void> {
  if (allowMemoryPersistence()) {
    const { replaceContractRecordInMemory } = await import("@/lib/contract-store");
    replaceContractRecordInMemory(contract);
    return;
  }

  await saveContractRecord(contract);
}

export async function ensureContractWorkflowCurrent(
  contract: ContractRecord,
  organizationId: string,
): Promise<ContractRecord> {
  const workflowOrganizationId = contract.companyProfileId || organizationId;
  const { ensureWorkflowConfigLoaded } = await import(
    "@/lib/workflow-config-server"
  );
  await ensureWorkflowConfigLoaded(workflowOrganizationId);

  if (!shouldSyncContractWorkflow(contract)) {
    return contract;
  }

  const reconciled = reconcileContractWorkflowWithConfig(
    contract,
    workflowOrganizationId,
  );

  if (!contractWorkflowNeedsSync(contract, reconciled)) {
    return contract;
  }

  await persistReconciledContract(reconciled);
  return reconciled;
}

export async function syncNonActiveContractWorkflows(
  organizationId: string,
): Promise<number> {
  const { ensureWorkflowConfigLoaded } = await import(
    "@/lib/workflow-config-server"
  );
  await ensureWorkflowConfigLoaded(organizationId);

  if (allowMemoryPersistence()) {
    const { syncNonActiveContractWorkflowsInMemory } = await import(
      "@/lib/contract-store"
    );
    return await syncNonActiveContractWorkflowsInMemory(organizationId);
  }

  const prisma = getPrismaClient();
  const records = await prisma.contract.findMany({
    where: {
      organizationId: {
        in: resolveOrganizationIds(organizationId),
      },
      stage: {
        in: [
          "request",
          "legal_review",
          "vp_review",
          "finance_review",
          "executive_signoff",
        ],
      },
    },
    select: {
      id: true,
      organizationId: true,
    },
  });

  let updatedCount = 0;

  for (const record of records) {
    const contract = await loadContractRecord(record.id, record.organizationId);

    if (!contract || !shouldSyncContractWorkflow(contract)) {
      continue;
    }

    const reconciled = reconcileContractWorkflowWithConfig(
      contract,
      contract.companyProfileId || record.organizationId,
    );

    if (!contractWorkflowNeedsSync(contract, reconciled)) {
      continue;
    }

    await saveContractRecord(reconciled);
    updatedCount += 1;
  }

  return updatedCount;
}
