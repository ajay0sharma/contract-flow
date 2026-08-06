import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { loadContractRecord } from "@/lib/contract-persistence";
import type { ContractRecord } from "@/types/contract";

export async function resolveSignatureContractContext(
  contractId: string,
): Promise<{ organizationId: string; contract: ContractRecord } | null> {
  const organizationId = await resolveContractOrganizationId(contractId);

  if (!organizationId) {
    return null;
  }

  const contract = await loadContractRecord(contractId, organizationId);

  if (!contract) {
    return null;
  }

  return { organizationId, contract };
}
