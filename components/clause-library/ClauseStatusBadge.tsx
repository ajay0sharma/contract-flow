import type { ClauseStatus } from "@/lib/generated/prisma/enums";
import { CLAUSE_STATUS_LABELS } from "@/types/clause-library";

const statusStyles: Record<ClauseStatus, string> = {
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  approved_with_modification: "bg-amber-50 text-amber-900 ring-amber-200",
  non_standard: "bg-rose-50 text-rose-800 ring-rose-200",
  deprecated: "bg-slate-100 text-slate-600 ring-slate-200",
};

interface ClauseStatusBadgeProps {
  status: ClauseStatus;
}

export function ClauseStatusBadge({ status }: ClauseStatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[status]}`}
    >
      {CLAUSE_STATUS_LABELS[status]}
    </span>
  );
}
