import { createId } from "@paralleldrive/cuid2";
import { randomInt } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getAllowedOrganizationIds,
  resolveClauseLibraryOrganizationId,
} from "@/lib/clause-library-org";
import { isAdminEmail, isLegalEmail } from "@/lib/access-control";
import { getUserDisplayName } from "@/lib/user-display-name";
import { SAFE_API_ERROR_MESSAGE } from "@/lib/error-reporting";
import type { ContractRecord } from "@/types/contract";

export interface ApiActor {
  email: string;
  name: string;
  organizationIds: string[];
  canViewOrgContracts: boolean;
}

export function generateContractId(): string {
  return createId();
}

export function generateContractRecordNumber(): string {
  const digits = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return `CR-${digits}`;
}

export async function requireApiActor():
  Promise<{ actor: ApiActor } | { response: NextResponse }> {
  const user = await currentUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const canViewOrgContracts = isAdminEmail(email) || isLegalEmail(email);

  return {
    actor: {
      email,
      name: getUserDisplayName(user),
      organizationIds: getAllowedOrganizationIds(),
      canViewOrgContracts,
    },
  };
}

export function resolveOrganizationId(companyProfileId?: string): string {
  return resolveClauseLibraryOrganizationId(companyProfileId);
}

export function contractBelongsToOrganization(
  contract: ContractRecord,
  organizationIds: string[],
): boolean {
  return organizationIds.includes(contract.companyProfileId);
}

export function canActorViewContract(
  contract: ContractRecord,
  actor: ApiActor,
): boolean {
  if (!contractBelongsToOrganization(contract, actor.organizationIds)) {
    return false;
  }

  if (actor.canViewOrgContracts) {
    return true;
  }

  return (
    contract.requesterEmail.trim().toLowerCase() ===
    actor.email.trim().toLowerCase()
  );
}

export function apiErrorResponse(
  message: string = SAFE_API_ERROR_MESSAGE,
  status = 500,
): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
