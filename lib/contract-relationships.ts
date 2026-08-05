import { getAllContracts } from "@/lib/contract-store";
import {
  deriveContractStatus,
} from "@/lib/contract-persistence";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { reportError } from "@/lib/error-reporting";
import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import type { ContractLifecycleStatus, ContractRecord, ContractStage } from "@/types/contract";
import type {
  RelationshipNode,
  RelationshipTreeResponse,
} from "@/types/contract-relationships";

const LEGACY_ORGANIZATION_IDS = ["seed-org-001"] as const;

type RelationshipSource = {
  id: string;
  recordNumber: string;
  title: string;
  contractType: string;
  stage: string;
  contractStatus: ContractLifecycleStatus;
  parentAgreementId: string | null;
  amountNumeric: number;
  companyName: string;
  createdAt: string;
};

function resolveOrganizationIds(organizationId: string): string[] {
  return [organizationId, ...LEGACY_ORGANIZATION_IDS];
}

function toRelationshipSource(record: ContractRecord): RelationshipSource {
  return {
    id: record.id,
    recordNumber: record.recordNumber,
    title: record.title,
    contractType: record.contractType,
    stage: record.stage,
    contractStatus:
      record.contractStatus ?? deriveContractStatus(record.stage),
    parentAgreementId: record.parentAgreementId,
    amountNumeric: record.amountNumeric,
    companyName: record.companyName,
    createdAt: record.createdAt,
  };
}

function toRelationshipNode(
  record: RelationshipSource,
  currentContractId: string,
): RelationshipNode {
  return {
    id: record.id,
    recordNumber: record.recordNumber,
    title: record.title,
    contractType: record.contractType,
    stage: record.stage,
    contractStatus: record.contractStatus,
    amountNumeric: record.amountNumeric > 0 ? record.amountNumeric : null,
    counterpartyName: record.companyName?.trim() || null,
    createdAt: record.createdAt,
    isCurrent: record.id === currentContractId,
  };
}

function mergeSourcesById(records: RelationshipSource[]): RelationshipSource[] {
  const merged = new Map<string, RelationshipSource>();

  for (const record of records) {
    merged.set(record.id, record);
  }

  return [...merged.values()];
}

async function loadPrismaRelationshipSources(
  organizationIds: string[],
  where: {
    id?: string;
    parentAgreementId?: string;
    parentAgreementIdIn?: string[];
    excludeId?: string;
  },
): Promise<RelationshipSource[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  try {
    const prisma = getPrismaClient();
    const records = await prisma.contract.findMany({
      where: {
        organizationId: {
          in: organizationIds,
        },
        ...(where.id ? { id: where.id } : {}),
        ...(where.parentAgreementId
          ? { parentAgreementId: where.parentAgreementId }
          : {}),
        ...(where.parentAgreementIdIn
          ? { parentAgreementId: { in: where.parentAgreementIdIn } }
          : {}),
        ...(where.excludeId ? { id: { not: where.excludeId } } : {}),
      },
      select: {
        id: true,
        recordNumber: true,
        title: true,
        contractType: true,
        stage: true,
        contractStatus: true,
        parentAgreementId: true,
        amountNumeric: true,
        companyName: true,
        createdAt: true,
      },
    });

    return records.map((record) => ({
      id: record.id,
      recordNumber: record.recordNumber,
      title: record.title,
      contractType: record.contractType,
      stage: record.stage,
      contractStatus:
        (record.contractStatus as ContractLifecycleStatus) ??
        deriveContractStatus(record.stage as ContractStage),
      parentAgreementId: record.parentAgreementId,
      amountNumeric:
        record.amountNumeric == null ? 0 : Number(record.amountNumeric),
      companyName: record.companyName ?? "",
      createdAt: record.createdAt.toISOString(),
    }));
  } catch (error) {
    reportError(error, { scope: "loadPrismaRelationshipSources" });

    if (!allowMemoryPersistence()) {
      throw error;
    }

    return [];
  }
}

function loadMemoryRelationshipSources(
  organizationIds: string[],
  where: {
    id?: string;
    parentAgreementId?: string;
    parentAgreementIdIn?: string[];
    excludeId?: string;
  },
): RelationshipSource[] {
  return getAllContracts()
    .filter((contract) => organizationIds.includes(contract.companyProfileId))
    .filter((contract) => {
      if (where.id && contract.id !== where.id) {
        return false;
      }

      if (
        where.parentAgreementId &&
        contract.parentAgreementId !== where.parentAgreementId
      ) {
        return false;
      }

      if (
        where.parentAgreementIdIn &&
        (!contract.parentAgreementId ||
          !where.parentAgreementIdIn.includes(contract.parentAgreementId))
      ) {
        return false;
      }

      if (where.excludeId && contract.id === where.excludeId) {
        return false;
      }

      return true;
    })
    .map(toRelationshipSource);
}

async function loadRelationshipSources(
  organizationIds: string[],
  where: {
    id?: string;
    parentAgreementId?: string;
    parentAgreementIdIn?: string[];
    excludeId?: string;
  },
): Promise<RelationshipSource[]> {
  if (allowMemoryPersistence()) {
    return loadMemoryRelationshipSources(organizationIds, where);
  }

  const prismaRecords = await loadPrismaRelationshipSources(organizationIds, where);
  return mergeSourcesById(prismaRecords);
}

async function loadSingleRelationshipSource(
  organizationIds: string[],
  contractId: string | null | undefined,
): Promise<RelationshipSource | null> {
  if (!contractId?.trim()) {
    return null;
  }

  const records = await loadRelationshipSources(organizationIds, {
    id: contractId,
  });

  return records[0] ?? null;
}

export async function loadContractRelationships(
  contractId: string,
  organizationId: string,
): Promise<RelationshipTreeResponse | null> {
  const organizationIds = resolveOrganizationIds(organizationId);
  const currentRecord = await loadMergedContractRecord(
    contractId,
    organizationId,
  );

  if (!currentRecord) {
    return null;
  }

  const currentSource = toRelationshipSource(currentRecord);
  const parentId = currentSource.parentAgreementId;

  const [parent, siblings, children] = await Promise.all([
    loadSingleRelationshipSource(organizationIds, parentId),
    parentId
      ? loadRelationshipSources(organizationIds, {
          parentAgreementId: parentId,
          excludeId: currentSource.id,
        })
      : Promise.resolve([]),
    loadRelationshipSources(organizationIds, {
      parentAgreementId: currentSource.id,
    }),
  ]);

  const childIds = children.map((child) => child.id);

  const [grandchildrenRecords, grandparent] = await Promise.all([
    childIds.length > 0
      ? loadRelationshipSources(organizationIds, {
          parentAgreementIdIn: childIds,
        })
      : Promise.resolve([]),
    parent?.parentAgreementId
      ? loadSingleRelationshipSource(
          organizationIds,
          parent.parentAgreementId,
        )
      : Promise.resolve(null),
  ]);

  const grandchildren = grandchildrenRecords.reduce<
    Record<string, RelationshipNode[]>
  >((groups, record) => {
    const parentKey = record.parentAgreementId;

    if (!parentKey) {
      return groups;
    }

    const node = toRelationshipNode(record, currentSource.id);

    if (!groups[parentKey]) {
      groups[parentKey] = [];
    }

    groups[parentKey].push(node);
    return groups;
  }, {});

  const parentNode = parent
    ? toRelationshipNode(parent, currentSource.id)
    : null;
  const grandparentNode = grandparent
    ? toRelationshipNode(grandparent, currentSource.id)
    : null;
  const siblingNodes = siblings.map((record) =>
    toRelationshipNode(record, currentSource.id),
  );
  const childNodes = children.map((record) =>
    toRelationshipNode(record, currentSource.id),
  );

  const hasRelationships = Boolean(
    grandparentNode ||
      parentNode ||
      siblingNodes.length > 0 ||
      childNodes.length > 0 ||
      Object.values(grandchildren).some((records) => records.length > 0),
  );

  return {
    hasRelationships,
    currentContract: {
      id: currentSource.id,
      recordNumber: currentSource.recordNumber,
      title: currentSource.title,
      contractType: currentSource.contractType,
      stage: currentSource.stage,
      contractStatus: currentSource.contractStatus,
      amountNumeric:
        currentSource.amountNumeric > 0 ? currentSource.amountNumeric : null,
      counterpartyName: currentSource.companyName?.trim() || null,
    },
    grandparent: grandparentNode,
    parent: parentNode,
    siblings: siblingNodes,
    children: childNodes,
    grandchildren,
  };
}
