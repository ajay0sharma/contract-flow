import type { ContractStage } from "@/types/contract";
import { formatStageLabel } from "@/lib/workflow-engine";

const stageStyles: Record<ContractStage, string> = {
  request: "bg-gray-100 text-gray-600",
  legal_review: "bg-blue-50 text-blue-700",
  vp_review: "bg-purple-50 text-purple-700",
  finance_review: "bg-amber-50 text-amber-700",
  executive_signoff: "bg-orange-50 text-orange-700",
  awaiting_signature: "bg-teal-50 text-teal-700",
  active: "bg-green-50 text-green-700",
  expired: "bg-gray-50 text-gray-500",
  rejected: "bg-red-50 text-red-700",
};

interface StageBadgeProps {
  stage: ContractStage;
}

export function StageBadge({ stage }: StageBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${stageStyles[stage]}`}
    >
      {formatStageLabel(stage)}
    </span>
  );
}
