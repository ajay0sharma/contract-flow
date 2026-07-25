"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  approveContractAction,
  rejectContractAction,
} from "@/app/actions/contracts";

interface ContractReviewFormProps {
  contractId: string;
}

export function ContractReviewForm({ contractId }: ContractReviewFormProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      try {
        await approveContractAction(contractId, note);
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Unable to approve contract.",
        );
      }
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      try {
        await rejectContractAction(contractId, note);
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Unable to reject contract.",
        );
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Approval action</h2>
      <p className="mt-1 text-sm text-text-muted">
        Approve to route the contract to the next workflow step, or reject to
        stop the process.
      </p>

      <label
        htmlFor="reviewNote"
        className="mt-5 mb-2 block text-sm font-medium text-foreground"
      >
        Review notes
      </label>
      <textarea
        id="reviewNote"
        rows={4}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional comments for the audit trail."
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />

      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleApprove}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Processing..." : "Approve"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleReject}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-60"
        >
          Reject
        </button>
        <Link
          href={`/contracts/${contractId}`}
          className="rounded-md px-4 py-2 text-sm font-medium text-text-secondary hover:text-foreground"
        >
          Back to record
        </Link>
      </div>
    </div>
  );
}
