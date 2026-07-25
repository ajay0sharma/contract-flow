import {
  getAllContracts,
  getContractById,
} from "@/lib/contract-store";
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

export function getAllContractsBySubmissionDate(): ContractRecord[] {
  return getAllContracts().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function getLegalReviewAssignments(email: string): ContractRecord[] {
  const normalized = normalizeEmail(email);

  return getAllContracts()
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

export { getContractById };
