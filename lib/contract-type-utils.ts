import {
  CONTRACT_TEMPLATE_TYPE_DESCRIPTIONS,
  CONTRACT_TEMPLATE_TYPE_LABELS,
  CONTRACT_TEMPLATE_TYPES,
  type SystemContractTemplateType,
} from "@/types/contract-template";

const SLUG_PATTERN = /^[a-z][a-z0-9_]*$/;

export function slugifyContractTypeLabel(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!normalized) {
    return "";
  }

  return SLUG_PATTERN.test(normalized) ? normalized : `custom_${normalized}`;
}

export function isValidContractTypeSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && value.length <= 64;
}

export function buildSystemContractTypeSeed(organizationId: string) {
  return CONTRACT_TEMPLATE_TYPES.map((slug, index) => ({
    organizationId,
    slug,
    label: CONTRACT_TEMPLATE_TYPE_LABELS[slug as SystemContractTemplateType],
    description:
      CONTRACT_TEMPLATE_TYPE_DESCRIPTIONS[slug as SystemContractTemplateType],
    displayOrder: index,
    isActive: true,
    isSystem: true,
    createdById: "system",
  }));
}

export function makeUniqueContractTypeSlug(
  baseSlug: string,
  existingSlugs: Set<string>,
): string {
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  let candidate = `${baseSlug}_${suffix}`;

  while (existingSlugs.has(candidate)) {
    suffix += 1;
    candidate = `${baseSlug}_${suffix}`;
  }

  return candidate;
}
