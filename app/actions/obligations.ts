"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isLegalEmail } from "@/lib/access-control";
import { canViewContractRecord } from "@/lib/contract-store";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { getContractById } from "@/lib/contract-store";
import {
  getContractObligationView,
  runObligationScan,
} from "@/lib/obligation-store";
import { getUserDisplayName } from "@/lib/user-display-name";
import type { ContractObligationView } from "@/types/obligations";

async function getActor() {
  const user = await currentUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  return {
    email: user.primaryEmailAddress?.emailAddress ?? "",
    name: getUserDisplayName(user),
  };
}

export async function scanContractObligationsAction(
  contractId: string,
): Promise<ContractObligationView> {
  const actor = await getActor();

  if (!isLegalEmail(actor.email)) {
    throw new Error("Only legal users can run obligation scans.");
  }

  const contract = allowMemoryPersistence()
    ? getContractById(contractId)
    : await loadMergedContractRecord(
        contractId,
        (await resolveContractOrganizationId(contractId)) ??
          "default",
      );

  if (!contract) {
    throw new Error("Contract not found.");
  }

  if (!canViewContractRecord(contract, actor.email)) {
    throw new Error("You do not have access to this contract record.");
  }

  const result = await runObligationScan(contract, actor);

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/legal/dashboard");
  revalidatePath("/legal/reports");

  return result;
}

export async function getContractObligationViewAction(
  contractId: string,
): Promise<ContractObligationView> {
  const actor = await getActor();
  const contract = allowMemoryPersistence()
    ? getContractById(contractId)
    : await loadMergedContractRecord(
        contractId,
        (await resolveContractOrganizationId(contractId)) ??
          "default",
      );

  if (!contract) {
    throw new Error("Contract not found.");
  }

  if (!canViewContractRecord(contract, actor.email)) {
    throw new Error("You do not have access to this contract record.");
  }

  return getContractObligationView(contractId);
}
