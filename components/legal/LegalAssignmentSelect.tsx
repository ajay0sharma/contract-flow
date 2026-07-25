"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignLegalReviewerAction } from "@/app/actions/contracts";
import { PeoplePicker } from "@/components/shared/PeoplePicker";
import type { LegalAssignableUser } from "@/lib/access-control";

interface LegalAssignmentSelectProps {
  contractId: string;
  currentAssigneeEmail: string;
  currentAssigneeName?: string;
  assignees: LegalAssignableUser[];
}

export function LegalAssignmentSelect({
  contractId,
  currentAssigneeEmail,
  currentAssigneeName = "",
  assignees,
}: LegalAssignmentSelectProps) {
  const router = useRouter();
  const [selectedEmail, setSelectedEmail] = useState(currentAssigneeEmail);
  const [selectedName, setSelectedName] = useState(currentAssigneeName);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedAssignee = assignees.find(
    (assignee) =>
      assignee.email.toLowerCase() === selectedEmail.toLowerCase(),
  );
  const displayName =
    selectedAssignee?.name || selectedName || selectedEmail || "Unassigned";

  function handleAssign(user: { email: string; name: string } | null): void {
    if (!user?.email.trim()) {
      return;
    }

    setSelectedEmail(user.email);
    setSelectedName(user.name);
    setError(null);

    startTransition(async () => {
      try {
        await assignLegalReviewerAction(contractId, user.email);
        setIsEditing(false);
        router.refresh();
      } catch (actionError) {
        setSelectedEmail(currentAssigneeEmail);
        setSelectedName(currentAssigneeName);
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Unable to assign legal reviewer.",
        );
      }
    });
  }

  return (
    <div className="min-w-56">
      {!isEditing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            Locked
          </span>
          <span className="text-sm text-slate-800">{displayName}</span>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
          >
            Edit owner
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <PeoplePicker
            label="Legal reviewer"
            value={
              selectedEmail.trim()
                ? {
                    email: selectedEmail,
                    name: displayName,
                  }
                : null
            }
            onChange={handleAssign}
            disabled={isPending || assignees.length === 0}
            placeholder="Search by name or email..."
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setSelectedEmail(currentAssigneeEmail);
              setSelectedName(currentAssigneeName);
              setIsEditing(false);
              setError(null);
            }}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
