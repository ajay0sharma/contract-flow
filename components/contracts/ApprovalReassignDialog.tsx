"use client";

import { useEffect, useState } from "react";
import { PeoplePicker } from "@/components/shared/PeoplePicker";
import { getCurrentApprover } from "@/lib/workflow-engine";
import type { ContractRecord } from "@/types/contract";

interface ApprovalReassignDialogProps {
  open: boolean;
  contract: ContractRecord | null;
  onClose: () => void;
  onReassigned?: (contract: ContractRecord) => void;
}

export function ApprovalReassignDialog({
  open,
  contract,
  onClose,
  onReassigned,
}: ApprovalReassignDialogProps) {
  const [selectedAssignee, setSelectedAssignee] = useState<{
    email: string;
    name: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentApprover = contract ? getCurrentApprover(contract) : null;

  useEffect(() => {
    if (!open) {
      setSelectedAssignee(null);
      setNote("");
      setError(null);
      setIsSaving(false);
    }
  }, [open, contract?.id]);

  if (!open || !contract || !currentApprover) {
    return null;
  }

  async function handleSubmit(): Promise<void> {
    if (!contract || !selectedAssignee?.email.trim()) {
      setError("Search for and select a person to assign this approval to.");
      return;
    }

    const contractId = contract.id;
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/${contractId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeEmail: selectedAssignee.email,
          assigneeName: selectedAssignee.name,
          note: note.trim() || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | ContractRecord
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data && "error" in data && data.error
            ? data.error
            : "Failed to reassign approval.",
        );
      }

      onReassigned?.(data as ContractRecord);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to reassign approval.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">
          Re-route approval
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          {contract.title} ({contract.recordNumber})
        </p>
        <p className="mt-3 text-sm text-slate-700">
          Current step:{" "}
          <span className="font-medium">{currentApprover.name}</span>
        </p>
        <p className="text-sm text-slate-500">
          Currently assigned to {currentApprover.assigneeName} (
          {currentApprover.assigneeEmail})
        </p>

        <div className="mt-5">
          <PeoplePicker
            label="Assign to"
            value={selectedAssignee}
            onChange={setSelectedAssignee}
            placeholder="Search users by name or email..."
            helpText="Results come from your connected user directory."
            disabled={isSaving}
            required
          />
        </div>

        <label className="mt-4 block text-sm">
          <span className="mb-2 block font-medium text-slate-800">
            Note (optional)
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Reason for reassignment"
            disabled={isSaving}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
          />
        </label>

        {error ? (
          <p className="mt-3 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || !selectedAssignee}
            onClick={() => void handleSubmit()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Re-route approval"}
          </button>
        </div>
      </div>
    </div>
  );
}
