"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setContractConfidentialAction } from "@/app/actions/contracts";

interface ConfidentialityToggleProps {
  contractId: string;
  confidential: boolean;
}

export function ConfidentialityToggle({
  contractId,
  confidential,
}: ConfidentialityToggleProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    setError(null);

    startTransition(async () => {
      try {
        await setContractConfidentialAction(contractId, !confidential);
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Unable to update confidentiality.",
        );
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Confidential record
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Confidential records are visible only to the requester, support
            users, legal users, and admins.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60 ${
            confidential
              ? "border border-border bg-surface text-text-secondary hover:bg-surface-muted"
              : "bg-accent text-white hover:bg-accent-hover"
          }`}
        >
          {isPending
            ? "Updating..."
            : confidential
              ? "Remove confidential"
              : "Mark confidential"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
