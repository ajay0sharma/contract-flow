import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { createAndPersistContract } from "@/lib/contract-persistence";
import {
  filterContractRecords,
  listMergedContractRecords,
} from "@/lib/contract-list-service";
import { reportError } from "@/lib/error-reporting";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";
import { getCurrentApprover } from "@/lib/workflow-engine";
import type { ContractIntakeInput, ContractRecord } from "@/types/contract";

function parseListFilters(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  return {
    stage: searchParams.get("stage")?.trim() || undefined,
    contractType: searchParams.get("contractType")?.trim() || undefined,
    search: searchParams.get("search")?.trim() || undefined,
    assignedToMe: searchParams.get("assignedToMe") === "true",
  };
}

function filterContractsAssignedTo(
  contracts: ContractRecord[],
  email: string,
): ContractRecord[] {
  const normalizedEmail = email.trim().toLowerCase();

  return contracts.filter((contract) => {
    const currentStep = getCurrentApprover(contract);

    return (
      currentStep?.status === "current" &&
      currentStep.assigneeEmail.trim().toLowerCase() === normalizedEmail
    );
  });
}

function isPrivilegedUser(email: string): boolean {
  return isLegalEmail(email) || isAdminEmail(email);
}

export async function POST(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const actorName = getUserDisplayName(user);

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as ContractIntakeInput;
    const organizationId = resolveClauseLibraryOrganizationId(
      body.companyProfileId,
    );
    const input: ContractIntakeInput = {
      ...body,
      requesterName: actorName,
      requesterEmail: actorEmail,
      companyProfileId: organizationId,
    };
    const record = await createAndPersistContract(input, organizationId);

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: record.id,
      action: "contract_created",
      actorEmail,
      actorName,
      detail: `Created contract ${record.recordNumber} (${record.title}).`,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    reportError(error, { route: "POST /api/contracts" });
    return NextResponse.json(
      { error: "Failed to create contract" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const queryFilters = parseListFilters(request);

    if (queryFilters.assignedToMe) {
      const contracts = filterContractRecords(
        await listMergedContractRecords(organizationId),
        {
          stage: queryFilters.stage,
          contractType: queryFilters.contractType,
          search: queryFilters.search,
        },
      );

      return NextResponse.json(
        filterContractsAssignedTo(contracts, actorEmail),
      );
    }

    const contracts = filterContractRecords(
      await listMergedContractRecords(organizationId),
      {
        stage: queryFilters.stage,
        contractType: queryFilters.contractType,
        search: queryFilters.search,
        requesterEmail: isPrivilegedUser(actorEmail) ? undefined : actorEmail,
      },
    );

    return NextResponse.json(contracts);
  } catch (error) {
    reportError(error, { route: "GET /api/contracts" });
    return NextResponse.json(
      { error: "Failed to load contracts" },
      { status: 500 },
    );
  }
}
