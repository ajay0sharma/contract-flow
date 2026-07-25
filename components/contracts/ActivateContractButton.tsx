"use client";

import { useTransition } from "react";
import { activateContractAction } from "@/app/actions/contracts";

interface ActivateContractButtonProps {
  contractId: string;
}

export function ActivateContractButton({
  contractId,
}: ActivateContractButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await activateContractAction(contractId);
        });
      }}
      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
    >
      {isPending ? "Processing..." : "Mark as signed & active"}
    </button>
  );
}
