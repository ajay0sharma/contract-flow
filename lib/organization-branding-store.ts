import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import {
  createOrganizationBrandingSignedUrl,
  deleteOrganizationBrandingLogo,
  uploadOrganizationBrandingLogo,
} from "@/lib/supabase-storage";
import type {
  OrganizationBrandingRecord,
  OrganizationBrandingView,
  UpdateOrganizationBrandingInput,
} from "@/types/organization-branding";
import { DEFAULT_ORGANIZATION_BRANDING, HEX_COLOR_PATTERN } from "@/types/organization-branding";

const globalStore = globalThis as typeof globalThis & {
  __organizationBrandingStore?: Map<string, OrganizationBrandingRecord>;
};

function toIsoString(value: Date): string {
  return value.toISOString();
}

function getMemoryStore(): Map<string, OrganizationBrandingRecord> {
  if (!globalStore.__organizationBrandingStore) {
    globalStore.__organizationBrandingStore = new Map();
  }

  return globalStore.__organizationBrandingStore;
}

function mapBrandingRecord(record: {
  organizationId: string;
  productName: string;
  tagline: string | null;
  accentColor: string | null;
  logoStoragePath: string | null;
  logoFileName: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OrganizationBrandingRecord {
  return {
    organizationId: record.organizationId,
    productName: record.productName,
    tagline: record.tagline,
    accentColor: record.accentColor,
    logoStoragePath: record.logoStoragePath,
    logoFileName: record.logoFileName,
    updatedById: record.updatedById,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function buildDefaultBranding(organizationId: string): OrganizationBrandingRecord {
  const now = new Date().toISOString();

  return {
    organizationId,
    productName: DEFAULT_ORGANIZATION_BRANDING.productName,
    tagline: DEFAULT_ORGANIZATION_BRANDING.tagline,
    accentColor: DEFAULT_ORGANIZATION_BRANDING.accentColor,
    logoStoragePath: null,
    logoFileName: null,
    updatedById: null,
    createdAt: now,
    updatedAt: now,
  };
}

function canUseBrandingDatabase(): boolean {
  if (!isDatabaseConfigured()) {
    return false;
  }

  try {
    const prisma = getPrismaClient();
    return typeof prisma.organizationBranding?.findUnique === "function";
  } catch {
    return false;
  }
}

async function resolveLogoUrl(
  logoStoragePath: string | null,
): Promise<string | null> {
  if (!logoStoragePath) {
    return null;
  }

  try {
    return await createOrganizationBrandingSignedUrl(logoStoragePath);
  } catch {
    return null;
  }
}

export async function toOrganizationBrandingView(
  record: OrganizationBrandingRecord,
): Promise<OrganizationBrandingView> {
  return {
    organizationId: record.organizationId,
    productName: record.productName,
    tagline: record.tagline,
    accentColor: record.accentColor,
    logoUrl: await resolveLogoUrl(record.logoStoragePath),
    logoFileName: record.logoFileName,
  };
}

export async function getOrganizationBranding(
  organizationId: string,
): Promise<OrganizationBrandingRecord> {
  if (!canUseBrandingDatabase()) {
    return getMemoryStore().get(organizationId) ?? buildDefaultBranding(organizationId);
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.organizationBranding.findUnique({
      where: { organizationId },
    });

    if (record) {
      return mapBrandingRecord(record);
    }
  } catch {
    // Fall back when migration is not applied yet.
  }

  return getMemoryStore().get(organizationId) ?? buildDefaultBranding(organizationId);
}

function validateBrandingInput(
  input: UpdateOrganizationBrandingInput,
): string | null {
  if (input.productName !== undefined) {
    const productName = input.productName.trim();

    if (!productName) {
      return "Platform name is required.";
    }

    if (productName.length > 80) {
      return "Platform name must be 80 characters or fewer.";
    }
  }

  if (
    input.accentColor !== undefined &&
    input.accentColor !== null &&
    input.accentColor.trim() &&
    !HEX_COLOR_PATTERN.test(input.accentColor.trim())
  ) {
    return "Accent color must be a valid hex value like #3558A0.";
  }

  return null;
}

export async function updateOrganizationBranding(
  organizationId: string,
  input: UpdateOrganizationBrandingInput,
): Promise<{ branding?: OrganizationBrandingRecord; error?: string }> {
  const validationError = validateBrandingInput(input);

  if (validationError) {
    return { error: validationError };
  }

  const productName =
    input.productName !== undefined ? input.productName.trim() : undefined;
  const tagline =
    input.tagline === undefined
      ? undefined
      : input.tagline?.trim() || null;
  const accentColor =
    input.accentColor === undefined
      ? undefined
      : input.accentColor?.trim() || null;

  if (!canUseBrandingDatabase()) {
    const store = getMemoryStore();
    const current = store.get(organizationId) ?? buildDefaultBranding(organizationId);
    const updated: OrganizationBrandingRecord = {
      ...current,
      productName: productName ?? current.productName,
      tagline: tagline === undefined ? current.tagline : tagline,
      accentColor: accentColor === undefined ? current.accentColor : accentColor,
      updatedById: input.updatedById,
      updatedAt: new Date().toISOString(),
    };

    store.set(organizationId, updated);
    return { branding: updated };
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.organizationBranding.upsert({
      where: { organizationId },
      create: {
        organizationId,
        productName: productName ?? DEFAULT_ORGANIZATION_BRANDING.productName,
        tagline: tagline ?? null,
        accentColor: accentColor ?? null,
        updatedById: input.updatedById,
      },
      update: {
        ...(productName !== undefined ? { productName } : {}),
        ...(tagline !== undefined ? { tagline } : {}),
        ...(accentColor !== undefined ? { accentColor } : {}),
        updatedById: input.updatedById,
      },
    });

    const branding = mapBrandingRecord(record);
    getMemoryStore().set(organizationId, branding);
    return { branding };
  } catch {
    return { error: "Unable to save organization branding." };
  }
}

export async function uploadOrganizationBrandingLogoFile(
  organizationId: string,
  file: File,
  updatedById: string,
): Promise<{ branding?: OrganizationBrandingRecord; error?: string }> {
  const allowedTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/svg+xml",
    "image/webp",
  ]);

  if (!allowedTypes.has(file.type)) {
    return {
      error: "Logo must be a PNG, JPG, SVG, or WebP image.",
    };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { error: "Logo must be 2MB or smaller." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const current = await getOrganizationBranding(organizationId);

  if (current.logoStoragePath) {
    try {
      await deleteOrganizationBrandingLogo(current.logoStoragePath);
    } catch {
      // Continue even if old logo cleanup fails.
    }
  }

  const uploaded = await uploadOrganizationBrandingLogo(
    organizationId,
    file.name,
    buffer,
    file.type,
  );

  if (!canUseBrandingDatabase()) {
    const store = getMemoryStore();
    const updated: OrganizationBrandingRecord = {
      ...current,
      logoStoragePath: uploaded.storagePath,
      logoFileName: uploaded.fileName,
      updatedById,
      updatedAt: new Date().toISOString(),
    };
    store.set(organizationId, updated);
    return { branding: updated };
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.organizationBranding.upsert({
      where: { organizationId },
      create: {
        organizationId,
        productName: current.productName,
        tagline: current.tagline,
        accentColor: current.accentColor,
        logoStoragePath: uploaded.storagePath,
        logoFileName: uploaded.fileName,
        updatedById,
      },
      update: {
        logoStoragePath: uploaded.storagePath,
        logoFileName: uploaded.fileName,
        updatedById,
      },
    });

    const branding = mapBrandingRecord(record);
    getMemoryStore().set(organizationId, branding);
    return { branding };
  } catch {
    return { error: "Unable to save organization logo." };
  }
}

export async function removeOrganizationBrandingLogo(
  organizationId: string,
  updatedById: string,
): Promise<{ branding?: OrganizationBrandingRecord; error?: string }> {
  const current = await getOrganizationBranding(organizationId);

  if (current.logoStoragePath) {
    try {
      await deleteOrganizationBrandingLogo(current.logoStoragePath);
    } catch {
      return { error: "Unable to remove the current logo." };
    }
  }

  if (!canUseBrandingDatabase()) {
    const updated: OrganizationBrandingRecord = {
      ...current,
      logoStoragePath: null,
      logoFileName: null,
      updatedById,
      updatedAt: new Date().toISOString(),
    };
    getMemoryStore().set(organizationId, updated);
    return { branding: updated };
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.organizationBranding.upsert({
      where: { organizationId },
      create: {
        organizationId,
        productName: current.productName,
        tagline: current.tagline,
        accentColor: current.accentColor,
        updatedById,
      },
      update: {
        logoStoragePath: null,
        logoFileName: null,
        updatedById,
      },
    });

    const branding = mapBrandingRecord(record);
    getMemoryStore().set(organizationId, branding);
    return { branding };
  } catch {
    return { error: "Unable to remove organization logo." };
  }
}
