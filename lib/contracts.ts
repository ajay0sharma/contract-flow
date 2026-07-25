export {
  approveContract,
  addContractEmail,
  addContractAttachment,
  assignContractLegalReviewer,
  canViewContractRecord,
  getAllContracts,
  getContractById,
  getContractsVisibleTo,
  getContractsPendingApprovalBy,
  getContractsRequestedBy,
  getPipelineCounts,
  markContractActive,
  rejectContract,
  setContractConfidentiality,
  submitContractIntake,
  updateContractRecordDetails,
} from "@/lib/contract-store";

export {
  formatStageLabel,
  getCurrentApprover,
  getLifecycleSummary,
  isAmountPopulated,
  isAwaitingApproval,
} from "@/lib/workflow-engine";

export { resolveContractRecordNumber } from "@/lib/record-id";

/** @deprecated Use formatStageLabel instead */
export function formatStatusLabel(stage: string): string {
  return stage
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
