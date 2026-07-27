import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import {
  buildSystemContractTypeSeed,
  isValidContractTypeSlug,
  makeUniqueContractTypeSlug,
  slugifyContractTypeLabel,
} from "@/lib/contract-type-utils";
import type {
  ContractTypeRecord,
  CreateContractTypeInput,
  UpdateContractTypeInput,
} from "@/types/contract-template";

const globalStore = globalThis as typeof globalThis & {
  __contractTypeStore?: ContractTypeRecord[];
};

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapContractTypeRecord(record: {
  id: string;
  organizationId: string;
  slug: string;
  label: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  showInIntake: boolean;
  isSystem: boolean;
  canBeParentAgreement: boolean;
  requiresParentAgreement: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): ContractTypeRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    slug: record.slug,
    label: record.label,
    description: record.description,
    displayOrder: record.displayOrder,
    isActive: record.isActive,
    showInIntake: record.showInIntake,
    isSystem: record.isSystem,
    canBeParentAgreement: record.canBeParentAgreement,
    requiresParentAgreement: record.requiresParentAgreement,
    createdById: record.createdById,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function getMemoryStore(): ContractTypeRecord[] {
  if (!globalStore.__contractTypeStore) {
    const now = new Date().toISOString();
    globalStore.__contractTypeStore = buildSystemContractTypeSeed("default").map(
      (seed, index) => ({
        id: `ctype-memory-${seed.slug}`,
        organizationId: seed.organizationId,
        slug: seed.slug,
        label: seed.label,
        description: seed.description,
        displayOrder: seed.displayOrder,
        isActive: seed.isActive,
        showInIntake: true,
        isSystem: seed.isSystem,
        canBeParentAgreement: false,
        requiresParentAgreement: false,
        createdById: seed.createdById,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  return globalStore.__contractTypeStore;
}

function listMemoryContractTypes(
  organizationId: string,
  options?: { includeInactive?: boolean },
): ContractTypeRecord[] {
  const types = getMemoryStore().filter(
    (type) =>
      type.organizationId === organizationId &&
      (options?.includeInactive || type.isActive),
  );

  return [...types].sort((left, right) => {
    if (left.displayOrder !== right.displayOrder) {
      return left.displayOrder - right.displayOrder;
    }

    return left.label.localeCompare(right.label);
  });
}

function canUseContractTypeDatabase(): boolean {
  if (!isDatabaseConfigured()) {
    return false;
  }

  try {
    const prisma = getPrismaClient();
    return typeof prisma.contractTypeDefinition?.upsert === "function";
  } catch {
    return false;
  }
}

export async function ensureSystemContractTypes(
  organizationId: string,
): Promise<void> {
  if (!canUseContractTypeDatabase()) {
    return;
  }

  const prisma = getPrismaClient();
  const seeds = buildSystemContractTypeSeed(organizationId);

  try {
    const existingCount = await prisma.contractTypeDefinition.count({
      where: { organizationId },
    });

    if (existingCount > 0) {
      return;
    }

    for (const seed of seeds) {
      await prisma.contractTypeDefinition.create({
        data: seed,
      });
    }
  } catch {
    // Migration may not be applied yet; callers fall back to in-memory types.
  }
}

export async function listContractTypes(
  organizationId: string,
  options?: { includeInactive?: boolean },
): Promise<ContractTypeRecord[]> {
  if (!canUseContractTypeDatabase()) {
    return listMemoryContractTypes(organizationId, options);
  }

  await ensureSystemContractTypes(organizationId);

  try {
    const prisma = getPrismaClient();
    const records = await prisma.contractTypeDefinition.findMany({
      where: {
        organizationId,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
    });

    if (records.length > 0) {
      return records.map(mapContractTypeRecord);
    }
  } catch {
    // Table missing or migration not applied yet.
  }

  return listMemoryContractTypes(organizationId, options);
}

export async function isActiveContractTypeSlug(
  organizationId: string,
  slug: string,
): Promise<boolean> {
  const types = await listContractTypes(organizationId);
  return types.some((type) => type.slug === slug && type.isActive);
}

export async function resolveContractTypeLabel(
  organizationId: string,
  slug: string,
): Promise<string> {
  const types = await listContractTypes(organizationId);
  const match = types.find((type) => type.slug === slug);
  return match?.label ?? slug;
}

export async function listIntakeContractTypes(
  organizationId: string,
): Promise<ContractTypeRecord[]> {
  const types = await listContractTypes(organizationId);
  return types.filter((type) => type.isActive && type.showInIntake);
}

export async function getContractTypeById(
  id: string,
  organizationId: string,
): Promise<ContractTypeRecord | null> {
  const types = await listContractTypes(organizationId, { includeInactive: true });
  return types.find((type) => type.id === id) ?? null;
}

export async function updateContractType(
  id: string,
  organizationId: string,
  input: UpdateContractTypeInput,
): Promise<{ type?: ContractTypeRecord; error?: string }> {
  if (!canUseContractTypeDatabase()) {
    const store = getMemoryStore();
    const index = store.findIndex(
      (type) => type.id === id && type.organizationId === organizationId,
    );

    if (index === -1) {
      return { error: "Contract type not found." };
    }

    const current = store[index];
    const updated: ContractTypeRecord = {
      ...current,
      label: input.label?.trim() || current.label,
      description:
        input.description === undefined
          ? current.description
          : input.description?.trim() || null,
      displayOrder: input.displayOrder ?? current.displayOrder,
      isActive: input.isActive ?? current.isActive,
      showInIntake: input.showInIntake ?? current.showInIntake,
      canBeParentAgreement:
        input.canBeParentAgreement ?? current.canBeParentAgreement,
      requiresParentAgreement:
        input.requiresParentAgreement ?? current.requiresParentAgreement,
      updatedAt: new Date().toISOString(),
    };

    store[index] = updated;
    return { type: updated };
  }

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.contractTypeDefinition.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return { error: "Contract type not found." };
    }

    const updated = await prisma.contractTypeDefinition.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.displayOrder !== undefined
          ? { displayOrder: input.displayOrder }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.showInIntake !== undefined
          ? { showInIntake: input.showInIntake }
          : {}),
        ...(input.canBeParentAgreement !== undefined
          ? { canBeParentAgreement: input.canBeParentAgreement }
          : {}),
        ...(input.requiresParentAgreement !== undefined
          ? { requiresParentAgreement: input.requiresParentAgreement }
          : {}),
      },
    });

    return { type: mapContractTypeRecord(updated) };
  } catch {
    return { error: "Unable to update contract type." };
  }
}

export async function createContractType(
  input: CreateContractTypeInput,
): Promise<{ type?: ContractTypeRecord; error?: string }> {
  const label = input.label.trim();

  if (!label) {
    return { error: "Contract type name is required." };
  }

  if (label.length > 80) {
    return { error: "Contract type name must be 80 characters or fewer." };
  }

  const baseSlug = slugifyContractTypeLabel(label);

  if (!baseSlug || !isValidContractTypeSlug(baseSlug)) {
    return {
      error:
        "Enter a contract type name using letters and numbers (for example, Master Lease).",
    };
  }

  if (!canUseContractTypeDatabase()) {
    const store = getMemoryStore();
    const existingSlugs = new Set(
      store
        .filter((type) => type.organizationId === input.organizationId)
        .map((type) => type.slug),
    );
    const slug = makeUniqueContractTypeSlug(baseSlug, existingSlugs);
    const now = new Date().toISOString();
    const nextOrder =
      store.filter((type) => type.organizationId === input.organizationId)
        .length;
    const created: ContractTypeRecord = {
      id: `ctype-memory-${slug}`,
      organizationId: input.organizationId,
      slug,
      label,
      description: input.description?.trim() || null,
      displayOrder: nextOrder,
      isActive: true,
      showInIntake: true,
      isSystem: false,
      canBeParentAgreement: input.canBeParentAgreement ?? false,
      requiresParentAgreement: input.requiresParentAgreement ?? false,
      createdById: input.createdById,
      createdAt: now,
      updatedAt: now,
    };

    store.push(created);
    return { type: created };
  }

  await ensureSystemContractTypes(input.organizationId);

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.contractTypeDefinition.findMany({
      where: { organizationId: input.organizationId },
      select: { slug: true, label: true },
    });
    const existingSlugs = new Set(existing.map((type) => type.slug));
    const normalizedLabel = label.toLowerCase();

    const duplicateLabel = existing.find(
      (type) => type.label.trim().toLowerCase() === normalizedLabel,
    );

    if (duplicateLabel) {
      return {
        error: `A contract type named "${duplicateLabel.label}" already exists.`,
      };
    }

    const slug = makeUniqueContractTypeSlug(baseSlug, existingSlugs);
    const nextOrder = existing.length;

    const created = await prisma.contractTypeDefinition.create({
      data: {
        organizationId: input.organizationId,
        slug,
        label,
        description: input.description?.trim() || null,
        displayOrder: nextOrder,
        isActive: true,
        isSystem: false,
        canBeParentAgreement: input.canBeParentAgreement ?? false,
        requiresParentAgreement: input.requiresParentAgreement ?? false,
        createdById: input.createdById,
      },
    });

    return { type: mapContractTypeRecord(created) };
  } catch {
    return {
      error:
        "Contract types database is not ready. Run `npx prisma migrate deploy` and restart the dev server.",
    };
  }
}

export async function deleteContractType(
  id: string,
  organizationId: string,
): Promise<{ type?: ContractTypeRecord; deleted?: boolean; error?: string }> {
  const existing = await getContractTypeById(id, organizationId);

  if (!existing) {
    return { error: "Contract type not found." };
  }

  if (!canUseContractTypeDatabase()) {
    const store = getMemoryStore();
    const index = store.findIndex(
      (type) => type.id === id && type.organizationId === organizationId,
    );

    if (index === -1) {
      return { error: "Contract type not found." };
    }

    store.splice(index, 1);
    return { deleted: true };
  }

  try {
    const prisma = getPrismaClient();
    const [contractCount, templateCount] = await Promise.all([
      prisma.contract.count({
        where: {
          companyProfileId: organizationId,
          contractType: existing.label,
        },
      }),
      prisma.contractTemplate.count({
        where: {
          organizationId,
          contractType: existing.slug,
        },
      }),
    ]);

    if (contractCount > 0 || templateCount > 0) {
      const deactivated = await updateContractType(id, organizationId, {
        isActive: false,
        showInIntake: false,
      });

      if (deactivated.error || !deactivated.type) {
        return {
          error:
            deactivated.error ??
            "Unable to deactivate contract type that is in use.",
        };
      }

      return {
        type: deactivated.type,
        deleted: false,
      };
    }

    await prisma.contractTypeDefinition.delete({
      where: { id },
    });

    return { deleted: true };
  } catch {
    return { error: "Unable to delete contract type." };
  }
}
