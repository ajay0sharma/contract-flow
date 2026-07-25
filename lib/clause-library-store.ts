import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import type { ClauseStatus } from "@/lib/generated/prisma/enums";
import {
  CLAUSE_CATEGORIES,
  DEFAULT_ORGANIZATION_ID,
  type ClauseRecord,
  type CreateClauseInput,
  type UpdateClauseInput,
} from "@/types/clause-library";

const globalStore = globalThis as typeof globalThis & {
  __clauseLibraryStore?: ClauseRecord[];
};

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseContractTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function mapClauseRecord(record: {
  id: string;
  organizationId: string;
  title: string;
  category: string;
  contractTypes: unknown;
  status: ClauseStatus;
  preferredText: string;
  alternativeText: string | null;
  notes: string | null;
  lastReviewedAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): ClauseRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    title: record.title,
    category: record.category,
    contractTypes: parseContractTypes(record.contractTypes),
    status: record.status,
    preferredText: record.preferredText,
    alternativeText: record.alternativeText,
    notes: record.notes,
    lastReviewedAt: toIsoString(record.lastReviewedAt),
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function seedMemoryClauses(): ClauseRecord[] {
  const now = new Date().toISOString();

  return [
    {
      id: "clause-liability-1",
      organizationId: DEFAULT_ORGANIZATION_ID,
      title: "Standard limitation of liability",
      category: "Liability",
      contractTypes: ["vendor", "customer"],
      status: "approved",
      preferredText:
        "Except for excluded liabilities, each party's aggregate liability arising out of or related to this Agreement shall not exceed the total fees paid or payable by Customer to Vendor in the twelve (12) months preceding the event giving rise to the claim.",
      alternativeText:
        "Each party's liability shall be capped at two times (2x) the fees paid in the prior twelve (12) months when Customer requests a higher cap for strategic deals.",
      notes:
        "Do not accept uncapped liability for data breach unless cyber policy evidence is provided.",
      lastReviewedAt: now,
      createdById: "legal@example.com",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "clause-indemnity-1",
      organizationId: DEFAULT_ORGANIZATION_ID,
      title: "Vendor IP infringement indemnity",
      category: "Indemnification",
      contractTypes: ["vendor", "customer"],
      status: "approved_with_modification",
      preferredText:
        "Vendor shall defend, indemnify, and hold harmless Customer from third-party claims alleging that the Services infringe a U.S. patent, copyright, or trademark, provided Customer gives prompt notice and reasonable cooperation.",
      alternativeText: null,
      notes:
        "If vendor pushes back, limit indemnity to final injunctive relief and damages awarded.",
      lastReviewedAt: now,
      createdById: "legal@example.com",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "clause-termination-1",
      organizationId: DEFAULT_ORGANIZATION_ID,
      title: "Termination for convenience with notice",
      category: "Termination",
      contractTypes: ["customer"],
      status: "non_standard",
      preferredText:
        "Either party may terminate this SOW for convenience upon thirty (30) days' prior written notice, subject to payment for work performed through the effective termination date.",
      alternativeText:
        "Customer may terminate for convenience upon sixty (60) days' notice when transition assistance is required.",
      notes:
        "Escalate if counterparty requires less than 30 days or refuses to reimburse prepaid unused fees.",
      lastReviewedAt: now,
      createdById: "legal@example.com",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function getMemoryStore(): ClauseRecord[] {
  if (!globalStore.__clauseLibraryStore) {
    globalStore.__clauseLibraryStore = seedMemoryClauses();
  }

  return globalStore.__clauseLibraryStore;
}

function listMemoryClauses(organizationId: string): ClauseRecord[] {
  return getMemoryStore()
    .filter((clause) => clause.organizationId === organizationId)
    .sort((a, b) => a.title.localeCompare(b.title));
}

function createMemoryClause(input: CreateClauseInput): ClauseRecord {
  const store = getMemoryStore();
  const now = new Date().toISOString();
  const clause: ClauseRecord = {
    id: `clause-${Date.now()}`,
    organizationId: input.organizationId ?? DEFAULT_ORGANIZATION_ID,
    title: input.title,
    category: input.category,
    contractTypes: input.contractTypes,
    status: input.status,
    preferredText: input.preferredText,
    alternativeText: input.alternativeText ?? null,
    notes: input.notes ?? null,
    lastReviewedAt: now,
    createdById: input.createdById,
    createdAt: now,
    updatedAt: now,
  };

  store.unshift(clause);
  return clause;
}

function updateMemoryClause(
  id: string,
  input: UpdateClauseInput,
): ClauseRecord | null {
  const store = getMemoryStore();
  const index = store.findIndex((clause) => clause.id === id);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const updated: ClauseRecord = {
    ...store[index],
    ...input,
    alternativeText:
      input.alternativeText === undefined
        ? store[index].alternativeText
        : input.alternativeText,
    notes: input.notes === undefined ? store[index].notes : input.notes,
    lastReviewedAt: now,
    updatedAt: now,
  };

  store[index] = updated;
  return updated;
}

function archiveMemoryClause(id: string): ClauseRecord | null {
  const store = getMemoryStore();
  const index = store.findIndex((clause) => clause.id === id);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const updated: ClauseRecord = {
    ...store[index],
    status: "deprecated",
    updatedAt: now,
  };

  store[index] = updated;
  return updated;
}

export function isValidClauseCategory(category: string): boolean {
  return CLAUSE_CATEGORIES.includes(category as (typeof CLAUSE_CATEGORIES)[number]);
}

export async function listClauses(
  organizationId = DEFAULT_ORGANIZATION_ID,
): Promise<ClauseRecord[]> {
  if (!isDatabaseConfigured()) {
    return listMemoryClauses(organizationId);
  }

  try {
    const prisma = getPrismaClient();
    const records = await prisma.clauseLibrary.findMany({
      where: { organizationId },
      orderBy: [{ title: "asc" }],
    });

    return records.map(mapClauseRecord);
  } catch (error) {
    console.error("Failed to list clauses from database:", error);
    return listMemoryClauses(organizationId);
  }
}

export async function createClause(
  input: CreateClauseInput,
): Promise<ClauseRecord> {
  const organizationId = input.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const lastReviewedAt = new Date();

  if (!isDatabaseConfigured()) {
    return createMemoryClause({ ...input, organizationId });
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.clauseLibrary.create({
      data: {
        organizationId,
        title: input.title,
        category: input.category,
        contractTypes: input.contractTypes,
        status: input.status,
        preferredText: input.preferredText,
        alternativeText: input.alternativeText ?? null,
        notes: input.notes ?? null,
        lastReviewedAt,
        createdById: input.createdById,
      },
    });

    return mapClauseRecord(record);
  } catch (error) {
    console.error("Failed to create clause in database:", error);
    return createMemoryClause({ ...input, organizationId });
  }
}

export async function getClauseById(
  id: string,
  organizationId: string,
): Promise<ClauseRecord | null> {
  if (!isDatabaseConfigured()) {
    const clause =
      getMemoryStore().find(
        (entry) => entry.id === id && entry.organizationId === organizationId,
      ) ?? null;
    return clause;
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.clauseLibrary.findFirst({
      where: { id, organizationId },
    });
    return record ? mapClauseRecord(record) : null;
  } catch (error) {
    console.error("Failed to load clause from database:", error);
    return (
      getMemoryStore().find(
        (entry) => entry.id === id && entry.organizationId === organizationId,
      ) ?? null
    );
  }
}

export async function updateClause(
  id: string,
  organizationId: string,
  input: UpdateClauseInput,
): Promise<ClauseRecord | null> {
  const lastReviewedAt = new Date();

  if (!isDatabaseConfigured()) {
    const existing = getMemoryStore().find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );

    if (!existing) {
      return null;
    }

    return updateMemoryClause(id, input);
  }

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.clauseLibrary.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return null;
    }

    const record = await prisma.clauseLibrary.update({
      where: { id },
      data: {
        ...input,
        contractTypes: input.contractTypes,
        lastReviewedAt,
      },
    });

    return mapClauseRecord(record);
  } catch (error) {
    console.error("Failed to update clause in database:", error);

    const existing = getMemoryStore().find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );

    if (!existing) {
      return null;
    }

    return updateMemoryClause(id, input);
  }
}

export async function archiveClause(
  id: string,
  organizationId: string,
): Promise<ClauseRecord | null> {
  if (!isDatabaseConfigured()) {
    const existing = getMemoryStore().find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );

    if (!existing) {
      return null;
    }

    return archiveMemoryClause(id);
  }

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.clauseLibrary.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return null;
    }

    const record = await prisma.clauseLibrary.update({
      where: { id },
      data: { status: "deprecated" },
    });

    return mapClauseRecord(record);
  } catch (error) {
    console.error("Failed to archive clause in database:", error);

    const existing = getMemoryStore().find(
      (entry) => entry.id === id && entry.organizationId === organizationId,
    );

    if (!existing) {
      return null;
    }

    return archiveMemoryClause(id);
  }
}
