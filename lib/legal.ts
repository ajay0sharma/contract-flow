import {
  getAllContracts,
  getContractById,
} from "@/lib/contract-store";
import {
  listAllVisibleContractRecords,
  listMergedContractRecords,
} from "@/lib/contract-list-service";
import { getAllowedOrganizationIds } from "@/lib/clause-library-org";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { getCurrentApprover, isAwaitingApproval } from "@/lib/workflow-engine";
import {
  getLegalAssignableUsers,
  getLegalTeamEmails,
  isLegalEmail as isLegalUser,
} from "@/lib/access-control";
import type { ContractRecord } from "@/types/contract";

export { getLegalAssignableUsers, getLegalTeamEmails, isLegalUser };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getAllContractsBySubmissionDate(): Promise<ContractRecord[]> {
  if (allowMemoryPersistence()) {
    return getAllContracts().sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  const organizationIds = [
    ...getAllowedOrganizationIds(),
    "seed-org-001",
  ];
  const merged: ContractRecord[] = [];

  for (const organizationId of organizationIds) {
    merged.push(...(await listMergedContractRecords(organizationId)));
  }

  const unique = new Map<string, ContractRecord>();
  for (const contract of merged) {
    unique.set(contract.id, contract);
  }

  return [...unique.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export async function getLegalReviewAssignments(
  email: string,
): Promise<ContractRecord[]> {
  const normalized = normalizeEmail(email);
  const contracts = allowMemoryPersistence()
    ? getAllContracts()
    : await listAllVisibleContractRecords(email);

  return contracts
    .filter((contract) => {
      if (!isAwaitingApproval(contract)) {
        return false;
      }

      const current = getCurrentApprover(contract);

      return (
        current?.id === "legal" &&
        normalizeEmail(current.assigneeEmail) === normalized
      );
    })
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

export async function getContractByIdAsync(
  id: string,
  organizationId = "default",
): Promise<ContractRecord | undefined> {
  if (allowMemoryPersistence()) {
    return getContractById(id);
  }

  const { loadMergedContractRecord } = await import("@/lib/contract-list-service");
  return (await loadMergedContractRecord(id, organizationId)) ?? undefined;
}
