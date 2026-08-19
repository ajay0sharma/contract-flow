import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { ClauseUsageRecord } from "@/types/clause-library";

const globalStore = globalThis as typeof globalThis & {
  __clauseUsageStore?: ClauseUsageRecord[];
};

function getMemoryStore(): ClauseUsageRecord[] {
  if (!globalStore.__clauseUsageStore) {
    globalStore.__clauseUsageStore = [];
  }

  return globalStore.__clauseUsageStore;
}

export async function recordClauseDeviationUsage(input: {
  organizationId: string;
  contractId: string;
  clauseId: string;
  usedText: string;
}): Promise<ClauseUsageRecord> {
  const record: ClauseUsageRecord = {
    id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: input.organizationId,
    contractId: input.contractId,
    clauseId: input.clauseId,
    usedText: input.usedText,
    isDeviation: true,
    createdAt: new Date().toISOString(),
  };

  if (!isDatabaseConfigured() || allowMemoryPersistence()) {
    getMemoryStore().push(record);
    return record;
  }

  const prisma = getPrismaClient();
  const saved = await prisma.clauseUsage.create({
    data: {
      organizationId: input.organizationId,
      contractId: input.contractId,
      clauseId: input.clauseId,
      usedText: input.usedText,
      isDeviation: true,
    },
  });

  return {
    id: saved.id,
    organizationId: saved.organizationId,
    contractId: saved.contractId,
    clauseId: saved.clauseId,
    usedText: saved.usedText,
    isDeviation: saved.isDeviation,
    createdAt: saved.createdAt.toISOString(),
  };
}

export async function listClauseUsagesForContract(
  contractId: string,
): Promise<ClauseUsageRecord[]> {
  if (!isDatabaseConfigured() || allowMemoryPersistence()) {
    return getMemoryStore().filter((item) => item.contractId === contractId);
  }

  const prisma = getPrismaClient();
  const records = await prisma.clauseUsage.findMany({
    where: { contractId },
    orderBy: { createdAt: "desc" },
  });

  return records.map((item) => ({
    id: item.id,
    organizationId: item.organizationId,
    contractId: item.contractId,
    clauseId: item.clauseId,
    usedText: item.usedText,
    isDeviation: item.isDeviation,
    createdAt: item.createdAt.toISOString(),
  }));
}
