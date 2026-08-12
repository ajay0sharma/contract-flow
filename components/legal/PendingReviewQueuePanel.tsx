"use client";

import Link from "next/link";
import { StageBadge } from "@/components/contracts/StageBadge";
import {
  getLegalOwnerDisplay,
  isAwaitingLegalPickup,
} from "@/lib/legal-assignment";
import { getCurrentApprover, isAwaitingApproval } from "@/lib/workflow-engine";
import type { ContractRecord } from "@/types/contract";
import type { ReactNode } from "react";

function businessDaysSince(value: string, end: Date = new Date()): number {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  if (Number.isNaN(start.getTime()) || start >= endDay) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start);

  while (cursor < endDay) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();

    if (day !== 0 && day !== 6) {
      count += 1;
    }
  }

  return count;
}

interface PendingReviewQueuePanelProps {
  title: string;
  description: string;
  emptyMessage: string;
  contracts: ContractRecord[];
  loading: boolean;
  loadingSkeleton: ReactNode;
  showPickupActions?: boolean;
  actorEmail: string;
  pickupPendingId: string | null;
  actionPendingId: string | null;
  onPickup: (contractId: string) => void;
  onReassign: (contract: ContractRecord) => void;
  onApprove: (contract: ContractRecord) => void;
  onReject: (contract: ContractRecord) => void;
}

export function PendingReviewQueuePanel({
  title,
  description,
  emptyMessage,
  contracts,
  loading,
  loadingSkeleton,
  showPickupActions = false,
  actorEmail,
  pickupPendingId,
  actionPendingId,
  onPickup,
  onReassign,
  onApprove,
  onReject,
}: PendingReviewQueuePanelProps) {
  return (
    <section className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>

      {loading ? (
        loadingSkeleton
      ) : contracts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-3">
          {contracts.map((contract) => {
            const daysInStage = businessDaysSince(contract.updatedAt);
            const isStale = daysInStage > 5;
            const currentApprover = getCurrentApprover(contract);
            const legalOwner = getLegalOwnerDisplay(contract);
            const awaitingPickup = isAwaitingLegalPickup(contract);
            const canReassign =
              isAwaitingApproval(contract) &&
              currentApprover &&
              !awaitingPickup;
            const canActOnContract = Boolean(
              currentApprover &&
                currentApprover.assigneeEmail.trim().toLowerCase() ===
                  actorEmail.trim().toLowerCase() &&
                !awaitingPickup,
            );

            return (
              <li
                key={contract.id}
                className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {contract.recordNumber}
                      </Link>
                      <StageBadge stage={contract.stage} />
                      {legalOwner.unassigned ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                          Unassigned
                        </span>
                      ) : null}
                      <span
                        className={`text-xs font-medium ${
                          isStale ? "text-rose-700" : "text-slate-500"
                        }`}
                      >
                        {daysInStage} day{daysInStage === 1 ? "" : "s"} in stage
                      </span>
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-900">
                      {contract.title}
                    </p>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                      <div className="min-w-0">
                        <dt className="font-medium uppercase tracking-wide text-slate-500">
                          Submitted
                        </dt>
                        <dd className="mt-0.5 text-slate-700">
                          {contract.createdAt.slice(0, 10)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="font-medium uppercase tracking-wide text-slate-500">
                          Requester
                        </dt>
                        <dd className="mt-0.5 truncate text-slate-700">
                          {contract.requesterName}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="font-medium uppercase tracking-wide text-slate-500">
                          Type
                        </dt>
                        <dd className="mt-0.5 truncate text-slate-700">
                          {contract.contractType}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="font-medium uppercase tracking-wide text-slate-500">
                          Amount
                        </dt>
                        <dd className="mt-0.5 text-slate-700">
                          {contract.amount || "—"}
                        </dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="font-medium uppercase tracking-wide text-slate-500">
                          Legal owner
                        </dt>
                        <dd className="mt-0.5 text-slate-700">
                          {legalOwner.unassigned
                            ? "Awaiting pickup"
                            : legalOwner.label}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-md xl:justify-end">
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      View
                    </Link>
                    {showPickupActions && awaitingPickup ? (
                      <button
                        type="button"
                        disabled={
                          pickupPendingId === contract.id ||
                          actionPendingId === contract.id
                        }
                        onClick={() => onPickup(contract.id)}
                        className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {pickupPendingId === contract.id
                          ? "Picking up..."
                          : "Pick up"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={actionPendingId === contract.id || !canReassign}
                      onClick={() => onReassign(contract)}
                      className="rounded-md border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                    >
                      Re-route
                    </button>
                    <button
                      type="button"
                      disabled={
                        actionPendingId === contract.id ||
                        awaitingPickup ||
                        !canActOnContract
                      }
                      onClick={() => onApprove(contract)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={
                        actionPendingId === contract.id ||
                        awaitingPickup ||
                        !canActOnContract
                      }
                      onClick={() => onReject(contract)}
                      className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
