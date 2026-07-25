import type { ContractRecord } from "@/types/contract";

const RECORD_PREFIX = "CTR";

const globalStore = globalThis as typeof globalThis & {
  __nextContractRecordSequence?: number;
};

function parseRecordSequence(value: string | undefined | null): number | null {
  const match = value?.match(/(\d+)\s*$/);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function getHighestExistingSequence(contracts: ContractRecord[]): number {
  let highest = 0;

  for (const contract of contracts) {
    const candidates = [contract.recordNumber, contract.id];

    for (const candidate of candidates) {
      const sequence = parseRecordSequence(candidate);

      if (sequence !== null) {
        highest = Math.max(highest, sequence);
      }
    }
  }

  return highest;
}

export function allocateContractRecordIdentity(
  existingContracts: ContractRecord[],
): { recordNumber: string; id: string } {
  if (globalStore.__nextContractRecordSequence === undefined) {
    globalStore.__nextContractRecordSequence =
      getHighestExistingSequence(existingContracts);
  }

  globalStore.__nextContractRecordSequence += 1;

  const recordNumber = `${RECORD_PREFIX}-${globalStore.__nextContractRecordSequence}`;
  const id = recordNumber.toLowerCase();

  return { recordNumber, id };
}

export function formatContractRecordNumber(recordNumber: string): string {
  return recordNumber.toUpperCase();
}

export function normalizeContractRecordLookup(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveContractRecordNumber(contract: ContractRecord): string {
  if (contract.recordNumber) {
    return formatContractRecordNumber(contract.recordNumber);
  }

  return formatContractRecordNumber(contract.id);
}
