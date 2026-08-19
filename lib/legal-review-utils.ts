import { groupAttachmentsByVersion } from "@/lib/contract-attachment-versions";
import type { ContractAttachment } from "@/types/contract";

export function findComparableAttachmentPairs(
  attachments: ContractAttachment[],
): Array<{ baseline: ContractAttachment; counterparty: ContractAttachment }> {
  const pairs: Array<{
    baseline: ContractAttachment;
    counterparty: ContractAttachment;
  }> = [];

  for (const group of groupAttachmentsByVersion(attachments)) {
    if (group.priorVersions.length === 0) {
      continue;
    }

    const latestPrior = group.priorVersions[0];

    if (latestPrior) {
      pairs.push({
        baseline: latestPrior,
        counterparty: group.current,
      });
    }
  }

  return pairs;
}
