import Link from "next/link";
import { StageBadge } from "@/components/contracts/StageBadge";
import { formatContractDate } from "@/lib/format-dates";
import { resolveContractRecordNumber } from "@/lib/record-id";
import { formatStageLabel } from "@/lib/workflow-engine";
import type { ContractRecord } from "@/types/contract";

interface AdminSubmittedContractsTableProps {
  contracts: ContractRecord[];
}

export function AdminSubmittedContractsTable({
  contracts,
}: AdminSubmittedContractsTableProps) {
  if (contracts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-500">
        No contract requests have been submitted yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-stone-200">
        <thead className="bg-stone-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              Record ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              Submitted
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              Contract
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              Requester
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              Stage
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              Legal owner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {contracts.map((contract) => {
            const legalStep = contract.workflowSteps.find(
              (step) => step.id === "legal",
            );

            return (
              <tr key={contract.id} className="hover:bg-stone-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-stone-900">
                  {resolveContractRecordNumber(contract)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-stone-600">
                  {formatContractDate(contract.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-stone-900">{contract.title}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {contract.companyName}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-stone-700">
                  {contract.requesterName}
                </td>
                <td className="px-4 py-3 text-sm text-stone-700">
                  {contract.contractType}
                </td>
                <td className="px-4 py-3 text-sm text-stone-700">
                  {contract.amount || "—"}
                </td>
                <td className="px-4 py-3">
                  <StageBadge stage={contract.stage} />
                  <p className="mt-1 text-xs text-stone-500">
                    {formatStageLabel(contract.stage)}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-stone-700">
                  {legalStep?.assigneeName ?? "No legal step"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/contracts/${contract.id}`}
                    className="text-sm font-medium text-amber-700 hover:text-amber-900"
                  >
                    Open record
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
