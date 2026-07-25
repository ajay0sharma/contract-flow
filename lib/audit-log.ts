import type { AuditLogEntityType } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";

export type TemplateAuditAction =
  | "template_created"
  | "template_updated"
  | "template_version_uploaded"
  | "template_deactivated"
  | "template_activated"
  | "template_set_as_default"
  | "template_downloaded"
  | "template_opened"
  | "contract_draft_generated";

const globalAuditStore = globalThis as typeof globalThis & {
  __auditLogStore?: AuditLogEntry[];
};

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  entityType: AuditLogEntityType;
  entityId: string;
  action: string;
  detail: string | null;
  actorEmail: string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RecordAuditLogInput {
  organizationId: string;
  entityType: AuditLogEntityType;
  entityId: string;
  action: string;
  detail?: string | null;
  actorEmail: string;
  actorName?: string | null;
  metadata?: Record<string, unknown> | null;
}

function getAuditStore(): AuditLogEntry[] {
  if (!globalAuditStore.__auditLogStore) {
    globalAuditStore.__auditLogStore = [];
  }

  return globalAuditStore.__auditLogStore;
}

function mapAuditRecord(record: {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  detail: string | null;
  actorEmail: string;
  actorName: string | null;
  metadata: unknown;
  createdAt: Date;
}): AuditLogEntry {
  return {
    id: record.id,
    organizationId: record.organizationId,
    entityType: record.entityType as AuditLogEntityType,
    entityId: record.entityId,
    action: record.action,
    detail: record.detail,
    actorEmail: record.actorEmail,
    actorName: record.actorName,
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : null,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function recordAuditLog(
  input: RecordAuditLogInput,
): Promise<AuditLogEntry> {
  const entry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    detail: input.detail ?? null,
    actorEmail: input.actorEmail,
    actorName: input.actorName ?? null,
    metadata: input.metadata ?? null,
    createdAt: new Date().toISOString(),
  };

  if (!isDatabaseConfigured()) {
    getAuditStore().unshift(entry);
    return entry;
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        detail: input.detail ?? null,
        actorEmail: input.actorEmail,
        actorName: input.actorName ?? null,
        metadata: input.metadata
          ? (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue)
          : undefined,
      },
    });

    return mapAuditRecord(record);
  } catch (error) {
    console.error("Failed to record audit log:", error);
    getAuditStore().unshift(entry);
    return entry;
  }
}

export async function recordTemplateAuditLog(
  input: Omit<RecordAuditLogInput, "entityType"> & {
    action: TemplateAuditAction;
  },
): Promise<AuditLogEntry> {
  return recordAuditLog({
    ...input,
    entityType: "contract_template",
  });
}

export async function recordContractAuditLog(
  input: Omit<RecordAuditLogInput, "entityType">,
): Promise<AuditLogEntry> {
  return recordAuditLog({
    ...input,
    entityType: "contract",
  });
}

export async function writeAuditLog(
  input: RecordAuditLogInput,
): Promise<AuditLogEntry> {
  return recordAuditLog(input);
}

export async function listTemplateAuditLog(
  templateId: string,
  organizationId: string,
  limit = 50,
): Promise<AuditLogEntry[]> {
  if (!isDatabaseConfigured()) {
    return getAuditStore()
      .filter(
        (entry) =>
          entry.organizationId === organizationId &&
          entry.entityType === "contract_template" &&
          entry.entityId === templateId,
      )
      .slice(0, limit);
  }

  try {
    const prisma = getPrismaClient();
    const records = await prisma.auditLog.findMany({
      where: {
        organizationId,
        entityType: "contract_template",
        entityId: templateId,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return records.map(mapAuditRecord);
  } catch (error) {
    console.error("Failed to list template audit log:", error);
    return getAuditStore()
      .filter(
        (entry) =>
          entry.organizationId === organizationId &&
          entry.entityType === "contract_template" &&
          entry.entityId === templateId,
      )
      .slice(0, limit);
  }
}
