import type { ContractLifecycleStatus } from "@/types/contract";

const statusStyles: Record<ContractLifecycleStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending: "bg-blue-50 text-blue-700",
  active: "bg-green-50 text-green-700",
  expired: "bg-gray-50 text-gray-500",
  rejected: "bg-red-50 text-red-700",
};

const statusLabels: Record<ContractLifecycleStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  active: "Active",
  expired: "Expired",
  rejected: "Rejected",
};

interface ContractStatusBadgeProps {
  status: ContractLifecycleStatus;
}

export function ContractStatusBadge({ status }: ContractStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
