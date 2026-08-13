import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { resolveContractOrganizationId } from "@/lib/contract-email-org";
import {
  loadContractRecord,
  mapPrismaContractToRecord,
} from "@/lib/contract-persistence";
import { sanitizeContractRecordForClient } from "@/lib/contract-attachment-storage";
import { canViewContractRecord } from "@/lib/contract-store";
import { loadSyncedContractRecord } from "@/lib/contract-record-loader";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  ContractLifecycleStatus,
  ContractStage,
} from "@/lib/generated/prisma/enums";
import { reportError } from "@/lib/error-reporting";
import { getPrismaClient } from "@/lib/prisma";
import { isAdminEmail, isLegalEmail } from "@/lib/legal-access";
import { getUserDisplayName } from "@/lib/user-display-name";
import type { AuditEvent } from "@/types/contract";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const organizationId =
      (await resolveContractOrganizationId(id)) ??
      resolveClauseLibraryOrganizationId();
    const record = await loadSyncedContractRecord(id, organizationId);

    if (!record) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    if (!canViewContractRecord(record, actorEmail)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    return NextResponse.json(sanitizeContractRecordForClient(record));
  } catch (error) {
    reportError(error, { route: "GET /api/contracts/[id]", contractId: id });
    return NextResponse.json(
      { error: "Failed to load contract" },
      { status: 500 },
    );
  }
}

type ContractPatchBody = {
  title?: string;
  contractType?: string;
  department?: string;
  description?: string;
  otherNotes?: string;
  confidential?: boolean;
  companyName?: string;
  address?: string;
  mainContactName?: string;
  mainContactTitle?: string;
  mainContactEmail?: string;
  mainContactPhone?: string;
  amount?: string;
  amountNumeric?: number | string;
  currency?: string;
  budgeted?: boolean;
  poNumber?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  effectiveDate?: string;
  expiryDate?: string;
  templateId?: string;
  templateVersion?: number;
  contractVariables?: Record<string, unknown>;
  stage?: string;
  contractStatus?: string;
};

function parseOptionalDate(value: string): Date | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseContractVariables(
  value: unknown,
): Record<string, string> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      String(entryValue),
    ]),
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const actorEmail = user.primaryEmailAddress?.emailAddress?.trim() ?? "";
  const actorName = getUserDisplayName(user);

  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isLegalEmail(actorEmail) && !isAdminEmail(actorEmail)) {
    return NextResponse.json(
      { error: "Only legal and admin users can edit contract records" },
      { status: 403 },
    );
  }

  const { id } = await context.params;

  try {
    const organizationId = resolveClauseLibraryOrganizationId();
    const existing = await loadContractRecord(id, organizationId);

    if (!existing) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const body = (await request.json()) as ContractPatchBody;
    const updateData: Prisma.ContractUncheckedUpdateInput = {};

    if ("title" in body) {
      updateData.title = body.title ?? "";
    }

    if ("contractType" in body) {
      updateData.contractType = body.contractType ?? "";
    }

    if ("department" in body) {
      updateData.department = body.department?.trim() || null;
    }

    if ("description" in body) {
      updateData.description = body.description?.trim() || null;
    }

    if ("otherNotes" in body) {
      updateData.otherNotes = body.otherNotes?.trim() || null;
    }

    if ("confidential" in body) {
      updateData.confidential = Boolean(body.confidential);
    }

    if ("companyName" in body) {
      updateData.companyName = body.companyName?.trim() || null;
    }

    if ("address" in body) {
      updateData.address = body.address?.trim() || null;
    }

    if ("mainContactName" in body) {
      updateData.mainContactName = body.mainContactName?.trim() || null;
    }

    if ("mainContactTitle" in body) {
      updateData.mainContactTitle = body.mainContactTitle?.trim() || null;
    }

    if ("mainContactEmail" in body) {
      updateData.mainContactEmail = body.mainContactEmail?.trim() || null;
    }

    if ("mainContactPhone" in body) {
      updateData.mainContactPhone = body.mainContactPhone?.trim() || null;
    }

    if ("amount" in body) {
      updateData.amount = body.amount?.trim() || null;
    }

    if ("amountNumeric" in body) {
      const numericValue = Number(body.amountNumeric);

      updateData.amountNumeric = Number.isFinite(numericValue)
        ? new Prisma.Decimal(numericValue)
        : null;
    }

    if ("budgeted" in body) {
      updateData.budgeted = body.budgeted;
    }

    if ("poNumber" in body) {
      updateData.poNumber = body.poNumber?.trim() || null;
    }

    if ("contractStartDate" in body) {
      updateData.contractStartDate = body.contractStartDate?.trim() || null;
    }

    if ("contractEndDate" in body) {
      updateData.contractEndDate = body.contractEndDate?.trim() || null;
    }

    if ("effectiveDate" in body) {
      updateData.effectiveDate =
        body.effectiveDate == null || body.effectiveDate === ""
          ? null
          : parseOptionalDate(body.effectiveDate);
    }

    if ("expiryDate" in body) {
      updateData.expiryDate =
        body.expiryDate == null || body.expiryDate === ""
          ? null
          : parseOptionalDate(body.expiryDate);
    }

    if ("templateId" in body) {
      updateData.templateId = body.templateId?.trim() || null;
    }

    if ("templateVersion" in body) {
      updateData.templateVersion = body.templateVersion ?? null;
    }

    if ("stage" in body && body.stage) {
      updateData.stage = body.stage as ContractStage;
    }

    if ("contractStatus" in body && body.contractStatus) {
      updateData.contractStatus = body.contractStatus as ContractLifecycleStatus;
    }

    if ("contractVariables" in body) {
      updateData.contractVariables = body.contractVariables
        ? (JSON.parse(
            JSON.stringify(body.contractVariables),
          ) as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    if ("currency" in body) {
      const existingVariables =
        parseContractVariables(existing.contractVariables) ?? {};
      const nextVariables = {
        ...existingVariables,
        currency: body.currency ?? "",
      };

      updateData.contractVariables = JSON.parse(
        JSON.stringify(nextVariables),
      ) as Prisma.InputJsonValue;
    }

    const fieldsUpdated = Object.keys(updateData).filter(
      (key) => key !== "updatedAt" && key !== "auditTrail",
    );

    if (fieldsUpdated.length === 0) {
      return NextResponse.json(sanitizeContractRecordForClient(existing));
    }

    const auditEvent: AuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      actorName,
      actorEmail,
      action: "Edited",
      detail: "Contract record updated",
      fieldsUpdated,
    };

    updateData.auditTrail = [
      ...existing.auditTrail,
      auditEvent,
    ] as unknown as Prisma.InputJsonValue;
    updateData.updatedAt = new Date();

    const prisma = getPrismaClient();
    const updated = await prisma.contract.update({
      where: { id },
      data: updateData,
    });

    await writeAuditLog({
      organizationId,
      entityType: "contract",
      entityId: id,
      action: "contract_edited",
      actorEmail,
      actorName,
      detail: `Contract record updated by ${actorName}`,
      metadata: {
        fieldsUpdated: fieldsUpdated.filter((key) => key !== "auditTrail"),
      },
    });

    return NextResponse.json(
      sanitizeContractRecordForClient(mapPrismaContractToRecord(updated)),
    );
  } catch (error) {
    reportError(error, { route: "PATCH /api/contracts/[id]", contractId: id });
    return NextResponse.json(
      { error: "Failed to update contract record." },
      { status: 500 },
    );
  }
}
