import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ObligationStatus, ObligationType } from "@/lib/generated/prisma/enums";
import { requireLegalOrAdminApiActor } from "@/lib/api-privileged-auth";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { reportError } from "@/lib/error-reporting";
import { getPrismaClient } from "@/lib/prisma";

function parseTypesParam(value: string | null): ObligationType[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as ObligationType[];
}

function mapObligation(record: {
  id: string;
  contractId: string;
  organizationId: string;
  description: string;
  obligationType: ObligationType;
  dueDate: Date | null;
  isRecurring: boolean;
  frequency: string | null;
  noticePeriodDays: number | null;
  actionDeadline: Date | null;
  responsibleParty: string | null;
  status: ObligationStatus;
  counterpartyName: string | null;
  contractTitle: string | null;
  recordNumber: string | null;
  sourceClause: string | null;
  confidenceScore: string | null;
  createdAt: Date;
  updatedAt: Date;
  contract?: {
    stage: string;
    contractStatus: string;
  } | null;
}) {
  return {
    id: record.id,
    contractId: record.contractId,
    organizationId: record.organizationId,
    description: record.description,
    obligationType: record.obligationType,
    dueDate: record.dueDate?.toISOString() ?? null,
    isRecurring: record.isRecurring,
    frequency: record.frequency,
    noticePeriodDays: record.noticePeriodDays,
    actionDeadline: record.actionDeadline?.toISOString() ?? null,
    responsibleParty: record.responsibleParty,
    status: record.status,
    counterpartyName: record.counterpartyName,
    contractTitle: record.contractTitle,
    recordNumber: record.recordNumber,
    sourceClause: record.sourceClause,
    confidenceScore: record.confidenceScore,
    contractStage: record.contract?.stage ?? null,
    contractLifecycleStatus: record.contract?.contractStatus ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireLegalOrAdminApiActor();

  if ("response" in auth) {
    return auth.response;
  }

  const organizationId = resolveClauseLibraryOrganizationId();
  const params = request.nextUrl.searchParams;

  try {
    const where: Prisma.ObligationWhereInput = {
      organizationId,
    };

    const types = parseTypesParam(params.get("types"));
    if (types && types.length > 0) {
      where.obligationType = { in: types };
    }

    const counterparty = params.get("counterparty")?.trim();
    if (counterparty) {
      where.counterpartyName = {
        contains: counterparty,
        mode: "insensitive",
      };
    }

    const status = params.get("status")?.trim() as ObligationStatus | undefined;
    if (status) {
      where.status = status;
    }

    const responsibleParty = params.get("responsibleParty")?.trim();
    if (responsibleParty && responsibleParty !== "All") {
      where.responsibleParty = responsibleParty;
    }

    const dueDateFrom = params.get("dueDateFrom")?.trim();
    const dueDateTo = params.get("dueDateTo")?.trim();
    if (dueDateFrom || dueDateTo) {
      where.dueDate = {
        ...(dueDateFrom ? { gte: new Date(dueDateFrom) } : {}),
        ...(dueDateTo ? { lte: new Date(`${dueDateTo}T23:59:59.999Z`) } : {}),
      };
    }

    if (params.get("recurringOnly") === "true") {
      where.isRecurring = true;
    }

    const contractSearch = params.get("contractSearch")?.trim();
    if (contractSearch) {
      where.OR = [
        {
          contractTitle: {
            contains: contractSearch,
            mode: "insensitive",
          },
        },
        {
          recordNumber: {
            contains: contractSearch,
            mode: "insensitive",
          },
        },
      ];
    }

    const contractId = params.get("contractId")?.trim();
    if (contractId) {
      where.contractId = contractId;
    }

    const prisma = getPrismaClient();
    const [obligations, totalCount, typeGroups] = await Promise.all([
      prisma.obligation.findMany({
        where,
        include: {
          contract: {
            select: {
              stage: true,
              contractStatus: true,
            },
          },
        },
        orderBy: [{ obligationType: "asc" }, { dueDate: "asc" }],
      }),
      prisma.obligation.count({ where }),
      prisma.obligation.groupBy({
        by: ["obligationType"],
        where: { organizationId },
        _count: { id: true },
      }),
    ]);

    const typeCounts = Object.fromEntries(
      typeGroups.map((group) => [group.obligationType, group._count.id]),
    );

    return NextResponse.json({
      obligations: obligations.map(mapObligation),
      totalCount,
      typeCounts,
    });
  } catch (error) {
    reportError(error, { route: "GET /api/obligations" });
    return NextResponse.json(
      { error: "Failed to load obligations." },
      { status: 500 },
    );
  }
}
