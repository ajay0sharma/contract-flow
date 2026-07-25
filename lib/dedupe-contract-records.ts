import type { ContractRecord } from "@/types/contract";

export function dedupeContractRecordsById(
  contracts: ContractRecord[],
): ContractRecord[] {
  const seen = new Set<string>();

  return contracts.filter((contract) => {
    if (seen.has(contract.id)) {
      return false;
    }

    seen.add(contract.id);
    return true;
  });
}
