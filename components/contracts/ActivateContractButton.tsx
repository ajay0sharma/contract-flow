"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { activateContractAction } from "@/app/actions/contracts";

interface ActivateContractButtonProps {
  contractId: string;
  onActivated?: () => void;
}

export function ActivateContractButton({
  contractId,
  onActivated,
}: ActivateContractButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await activateContractAction(contractId);
          onActivated?.();
          router.refresh();
        });
      }}
      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
    >
      {isPending ? "Processing..." : "Mark as signed & active"}
    </button>
  );
}
