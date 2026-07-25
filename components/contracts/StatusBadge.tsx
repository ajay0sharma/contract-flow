import type { ContractStage } from "@/types/contract";
import { formatStageLabel } from "@/lib/contracts";

const statusStyles: Record<ContractStage, string> = {
  request: "bg-slate-100 text-slate-800 ring-slate-200",
  legal_review: "bg-indigo-50 text-indigo-900 ring-indigo-200",
  vp_review: "bg-fuchsia-50 text-fuchsia-900 ring-fuchsia-200",
  finance_review: "bg-amber-50 text-amber-900 ring-amber-200",
  executive_signoff: "bg-purple-50 text-purple-900 ring-purple-200",
  awaiting_signature: "bg-cyan-50 text-cyan-900 ring-cyan-200",
  active: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  expired: "bg-slate-100 text-slate-700 ring-slate-200",
  rejected: "bg-rose-50 text-rose-900 ring-rose-200",
};

interface StatusBadgeProps {
  status: ContractStage;
}

/** @deprecated Use StageBadge instead */
export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[status]}`}
    >
      {formatStageLabel(status)}
    </span>
  );
}
