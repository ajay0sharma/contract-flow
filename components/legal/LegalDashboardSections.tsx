import Link from "next/link";
import { StageBadge } from "@/components/contracts/StageBadge";
import { LegalAssignmentSelect } from "@/components/legal/LegalAssignmentSelect";
import { resolveContractRecordNumber } from "@/lib/record-id";
import { formatContractDate } from "@/lib/format-dates";
import { formatStageLabel } from "@/lib/workflow-engine";
import type { LegalAssignableUser } from "@/lib/access-control";
import type { ContractRecord } from "@/types/contract";

interface LegalSubmissionTableProps {
  contracts: ContractRecord[];
  legalAssignees: LegalAssignableUser[];
}

export function LegalSubmissionTable({
  contracts,
  legalAssignees,
}: LegalSubmissionTableProps) {
  if (contracts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
        No contracts have been submitted yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Record ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Submitted
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contract
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Requester
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Stage
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Legal owner
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {contracts.map((contract) => {
            const legalStep = contract.workflowSteps.find(
              (step) => step.id === "legal",
            );

            return (
              <tr key={contract.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
                  {resolveContractRecordNumber(contract)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                  {formatContractDate(contract.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{contract.title}</p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {contract.requesterName}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {contract.contractType}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {contract.amount || "—"}
                </td>
                <td className="px-4 py-3">
                  <StageBadge stage={contract.stage} />
                </td>
                <td className="px-4 py-3">
                  {legalStep ? (
                    <LegalAssignmentSelect
                      contractId={contract.id}
                      currentAssigneeEmail={legalStep.assigneeEmail}
                      currentAssigneeName={legalStep.assigneeName}
                      assignees={legalAssignees}
                    />
                  ) : (
                    <span className="text-sm text-slate-500">No legal step</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/contracts/${contract.id}`}
                    className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
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

interface LegalReviewQueueProps {
  contracts: ContractRecord[];
  emptyMessage: string;
  legalAssignees: LegalAssignableUser[];
}

export function LegalReviewQueue({
  contracts,
  emptyMessage,
  legalAssignees,
}: LegalReviewQueueProps) {
  if (contracts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-indigo-200 bg-indigo-50 px-4 py-8 text-center text-sm text-indigo-800">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {contracts.map((contract) => {
        const legalStep = contract.workflowSteps.find(
          (step) => step.id === "legal",
        );

        return (
          <li
            key={contract.id}
            className="rounded-xl border border-indigo-200 bg-white px-5 py-4 shadow-sm"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">
                  Assigned to you
                </p>
                <p className="mt-1 font-medium text-slate-900">{contract.title}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {resolveContractRecordNumber(contract)} · Submitted{" "}
                  {formatContractDate(contract.createdAt)} ·{" "}
                  {contract.requesterName}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {contract.contractType} · {contract.amount || "—"}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <span className="w-fit rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-900">
                  {formatStageLabel(contract.stage)}
                </span>
                {legalStep ? (
                  <LegalAssignmentSelect
                    contractId={contract.id}
                    currentAssigneeEmail={legalStep.assigneeEmail}
                    currentAssigneeName={legalStep.assigneeName}
                    assignees={legalAssignees}
                  />
                ) : null}
                <Link
                  href={`/contracts/${contract.id}/review`}
                  className="w-fit rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800"
                >
                  Review contract
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
