import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import {
  buildDefaultIntakeFormSections,
  makeUniqueIntakeKey,
  slugifyIntakeKey,
} from "@/lib/intake-form-catalog";
import type {
  IntakeFormDefinitionRecord,
  IntakeFormFieldRecord,
  IntakeFormSectionRecord,
  SaveIntakeFormInput,
} from "@/types/intake-form";
import type { TemplateVariableFieldType } from "@/types/contract-template";

const globalStore = globalThis as typeof globalThis & {
  __intakeFormStore?: IntakeFormDefinitionRecord[];
};

function toIsoString(value: Date): string {
  return value.toISOString();
}

function parseSelectOptions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function mapFieldRecord(record: {
  id: string;
  sectionId: string;
  key: string;
  label: string;
  fieldType: TemplateVariableFieldType;
  isRequired: boolean;
  isSystem: boolean;
  displayOrder: number;
  helpText: string | null;
  placeholder: string | null;
  selectOptions: unknown;
  createdAt: Date;
  updatedAt: Date;
}): IntakeFormFieldRecord {
  return {
    id: record.id,
    sectionId: record.sectionId,
    key: record.key,
    label: record.label,
    fieldType: record.fieldType,
    isRequired: record.isRequired,
    isSystem: record.isSystem,
    displayOrder: record.displayOrder,
    helpText: record.helpText,
    placeholder: record.placeholder,
    selectOptions: parseSelectOptions(record.selectOptions),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function mapSectionRecord(record: {
  id: string;
  formId: string;
  key: string;
  label: string;
  description: string | null;
  displayOrder: number;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  fields: Array<Parameters<typeof mapFieldRecord>[0]>;
}): IntakeFormSectionRecord {
  return {
    id: record.id,
    formId: record.formId,
    key: record.key,
    label: record.label,
    description: record.description,
    displayOrder: record.displayOrder,
    isSystem: record.isSystem,
    fields: [...record.fields]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map(mapFieldRecord),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function mapFormRecord(record: {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  sections: Array<Parameters<typeof mapSectionRecord>[0]>;
}): IntakeFormDefinitionRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    isActive: record.isActive,
    sections: [...record.sections]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map(mapSectionRecord),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function getMemoryStore(): IntakeFormDefinitionRecord[] {
  if (!globalStore.__intakeFormStore) {
    globalStore.__intakeFormStore = [];
  }

  return globalStore.__intakeFormStore;
}

function canUseIntakeFormDatabase(): boolean {
  if (!isDatabaseConfigured()) {
    return false;
  }

  try {
    const prisma = getPrismaClient();
    return typeof prisma.intakeFormDefinition?.findFirst === "function";
  } catch {
    return false;
  }
}

function normalizeSectionInput(
  input: SaveIntakeFormInput["sections"][number],
  sectionIndex: number,
  existingSectionKeys: string[],
): {
  key: string;
  label: string;
  description: string | null;
  displayOrder: number;
  isSystem: boolean;
  fields: Array<{
    key: string;
    label: string;
    fieldType: TemplateVariableFieldType;
    isRequired: boolean;
    isSystem: boolean;
    displayOrder: number;
    helpText: string | null;
    placeholder: string | null;
    selectOptions: string[];
  }>;
} {
  const sectionKey =
    input.key.trim() ||
    makeUniqueIntakeKey(input.label, existingSectionKeys.slice(0, sectionIndex));

  const fieldKeys: string[] = [];

  const fields = input.fields.map((field, fieldIndex) => {
    const key =
      field.key.trim() ||
      makeUniqueIntakeKey(field.label, [...fieldKeys, ...existingSectionKeys]);

    fieldKeys.push(key);

    return {
      key,
      label: field.label.trim(),
      fieldType: field.fieldType,
      isRequired: field.isRequired ?? false,
      isSystem: field.isSystem ?? false,
      displayOrder: field.displayOrder ?? fieldIndex,
      helpText: field.helpText ?? null,
      placeholder: field.placeholder ?? null,
      selectOptions: field.selectOptions ?? [],
    };
  });

  return {
    key: sectionKey,
    label: input.label.trim(),
    description: input.description ?? null,
    displayOrder: input.displayOrder ?? sectionIndex,
    isSystem: input.isSystem ?? false,
    fields,
  };
}

export async function ensureDefaultIntakeForm(
  organizationId: string,
): Promise<IntakeFormDefinitionRecord> {
  const existing = await getActiveIntakeForm(organizationId);

  if (existing) {
    return existing;
  }

  return saveIntakeForm({
    organizationId,
    name: "Default",
    sections: buildDefaultIntakeFormSections(),
  });
}

export async function getActiveIntakeForm(
  organizationId: string,
): Promise<IntakeFormDefinitionRecord | null> {
  if (!canUseIntakeFormDatabase()) {
    const memoryForm = getMemoryStore().find(
      (form) => form.organizationId === organizationId && form.isActive,
    );

    return memoryForm ?? null;
  }

  const prisma = getPrismaClient();
  const record = await prisma.intakeFormDefinition.findFirst({
    where: {
      organizationId,
      isActive: true,
    },
    include: {
      sections: {
        include: {
          fields: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return record ? mapFormRecord(record) : null;
}

export async function saveIntakeForm(
  input: SaveIntakeFormInput,
): Promise<IntakeFormDefinitionRecord> {
  const sectionKeys: string[] = [];
  const normalizedSections = input.sections.map((section, index) => {
    const normalized = normalizeSectionInput(section, index, sectionKeys);
    sectionKeys.push(normalized.key);
    return normalized;
  });

  if (!canUseIntakeFormDatabase()) {
    const now = new Date().toISOString();
    const formId = `intake-form-memory-${input.organizationId}`;
    const form: IntakeFormDefinitionRecord = {
      id: formId,
      organizationId: input.organizationId,
      name: input.name?.trim() || "Default",
      isActive: true,
      createdAt: now,
      updatedAt: now,
      sections: normalizedSections.map((section) => {
        const sectionId = `${formId}-${section.key}`;

        return {
          id: sectionId,
          formId,
          key: section.key,
          label: section.label,
          description: section.description,
          displayOrder: section.displayOrder,
          isSystem: section.isSystem,
          createdAt: now,
          updatedAt: now,
          fields: section.fields.map((field) => ({
            id: `${sectionId}-${field.key}`,
            sectionId,
            key: field.key,
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            isSystem: field.isSystem,
            displayOrder: field.displayOrder,
            helpText: field.helpText,
            placeholder: field.placeholder,
            selectOptions: field.selectOptions,
            createdAt: now,
            updatedAt: now,
          })),
        };
      }),
    };

    const store = getMemoryStore().filter(
      (entry) => entry.organizationId !== input.organizationId,
    );
    store.push(form);
    globalStore.__intakeFormStore = store;
    return form;
  }

  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    await tx.intakeFormDefinition.updateMany({
      where: {
        organizationId: input.organizationId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    const created = await tx.intakeFormDefinition.create({
      data: {
        organizationId: input.organizationId,
        name: input.name?.trim() || "Default",
        isActive: true,
        sections: {
          create: normalizedSections.map((section) => ({
            key: section.key,
            label: section.label,
            description: section.description,
            displayOrder: section.displayOrder,
            isSystem: section.isSystem,
            fields: {
              create: section.fields.map((field) => ({
                key: field.key,
                label: field.label,
                fieldType: field.fieldType,
                isRequired: field.isRequired,
                isSystem: field.isSystem,
                displayOrder: field.displayOrder,
                helpText: field.helpText,
                placeholder: field.placeholder,
                selectOptions: field.selectOptions,
              })),
            },
          })),
        },
      },
      include: {
        sections: {
          include: {
            fields: true,
          },
        },
      },
    });

    return mapFormRecord(created);
  });
}

export async function resetIntakeFormToDefaults(
  organizationId: string,
): Promise<IntakeFormDefinitionRecord> {
  return saveIntakeForm({
    organizationId,
    name: "Default",
    sections: buildDefaultIntakeFormSections(),
  });
}

export function slugifyCustomIntakeFieldKey(label: string): string {
  return slugifyIntakeKey(label);
}
