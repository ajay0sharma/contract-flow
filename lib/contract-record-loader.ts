import {
  withDerivedContractStatus,
  loadMergedContractRecord,
} from "@/lib/contract-list-service";
import type { ContractRecord } from "@/types/contract";

export async function loadSyncedContractRecord(
  lookup: string,
  organizationId: string,
): Promise<ContractRecord | null> {
  const record = await loadMergedContractRecord(lookup, organizationId);

  if (!record) {
    return null;
  }

  const { ensureContractWorkflowCurrent } = await import(
    "@/lib/workflow-contract-sync"
  );
  const synced = await ensureContractWorkflowCurrent(record, organizationId);

  return withDerivedContractStatus(synced);
}
