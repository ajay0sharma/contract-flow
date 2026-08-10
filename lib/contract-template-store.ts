import { getPrismaClient, isDatabaseConfigured } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { countInProgressContractsUsingTemplate } from "@/lib/contract-list-service";
import { recordTemplateAuditLog } from "@/lib/audit-log";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import {
  parseSelectOptions,
  validateTemplateVariables,
} from "@/lib/contract-template-utils";
import type {
  ContractTemplateRecord,
  ContractTemplateVersionRecord,
  CreateContractTemplateInput,
  TemplateDefaultChange,
  TemplateFileReference,
  TemplateMutationResult,
  TemplateVariableInput,
  TemplateVariableRecord,
  TemplateVersionHistoryEntry,
  UpdateContractTemplateInput,
} from "@/types/contract-template";
import { getContractTypeLabel } from "@/types/contract-template";

type TemplateMutationOptions = {
  placeholderWarning?: string | null;
  actorName?: string | null;
};

const globalStore = globalThis as typeof globalThis & {
  __contractTemplateStore?: ContractTemplateRecord[];
  __contractTemplateVersionStore?: ContractTemplateVersionRecord[];
};

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapVariableRecord(record: {
  id: string;
  templateId: string;
  name: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  defaultValue: string | null;
  selectOptions: unknown;
  helpText: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): TemplateVariableRecord {
  return {
    id: record.id,
    templateId: record.templateId,
    name: record.name,
    label: record.label,
    fieldType: record.fieldType as TemplateVariableRecord["fieldType"],
    isRequired: record.isRequired,
    defaultValue: record.defaultValue,
    selectOptions: parseSelectOptions(record.selectOptions),
    helpText: record.helpText,
    displayOrder: record.displayOrder,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function mapTemplateRecord(record: {
  id: string;
  organizationId: string;
  title: string;
  contractType: string;
  description: string | null;
  fileName: string;
  storagePath: string;
  fileSize: number;
  version: number;
  isActive: boolean;
  showInIntake: boolean;
  isDefault: boolean;
  uploadedById: string;
  uploadedAt: Date;
  lastUpdatedById: string;
  createdAt: Date;
  updatedAt: Date;
  variables?: Array<Parameters<typeof mapVariableRecord>[0]>;
}): ContractTemplateRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    title: record.title,
    contractType: record.contractType as ContractTemplateRecord["contractType"],
    description: record.description,
    fileName: record.fileName,
    storagePath: record.storagePath,
    fileSize: record.fileSize,
    version: record.version,
    isActive: record.isActive,
    showInIntake: record.showInIntake,
    isDefault: record.isDefault,
    uploadedById: record.uploadedById,
    uploadedAt: toIsoString(record.uploadedAt),
    lastUpdatedById: record.lastUpdatedById,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    variables: (record.variables ?? []).map(mapVariableRecord),
  };
}

function mapVersionRecord(record: {
  id: string;
  templateId: string;
  version: number;
  fileName: string;
  storagePath: string;
  fileSize: number;
  uploadedById: string;
  uploadedAt: Date;
  changeNote: string | null;
}): ContractTemplateVersionRecord {
  return {
    id: record.id,
    templateId: record.templateId,
    version: record.version,
    fileName: record.fileName,
    storagePath: record.storagePath,
    fileSize: record.fileSize,
    uploadedById: record.uploadedById,
    uploadedAt: toIsoString(record.uploadedAt),
    changeNote: record.changeNote,
  };
}

function seedVariables(): TemplateVariableRecord[] {
  const now = new Date().toISOString();

  return [
    {
      id: "template-var-counterparty",
      templateId: "template-nda-1",
      name: "COUNTERPARTY_NAME",
      label: "Counterparty name",
      fieldType: "text",
      isRequired: true,
      defaultValue: "Acme Corp",
      selectOptions: [],
      helpText: null,
      displayOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "template-var-effective-date",
      templateId: "template-nda-1",
      name: "EFFECTIVE_DATE",
      label: "Effective date",
      fieldType: "date",
      isRequired: true,
      defaultValue: "2026-01-15",
      selectOptions: [],
      helpText: null,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "template-var-contract-value",
      templateId: "template-nda-1",
      name: "CONTRACT_VALUE",
      label: "Contract value",
      fieldType: "currency",
      isRequired: false,
      defaultValue: "250000",
      selectOptions: [],
      helpText: null,
      displayOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function seedTemplates(): ContractTemplateRecord[] {
  const now = new Date().toISOString();
  const organizationId = resolveClauseLibraryOrganizationId();
  const variables = seedVariables();

  return [
    {
      id: "template-nda-1",
      organizationId,
      title: "Standard NDA",
      contractType: "nda",
      description: "Mutual non-disclosure agreement for early-stage discussions.",
      fileName: "standard-nda.docx",
      storagePath: `${organizationId}/template-nda-1/v1/standard-nda.docx`,
      fileSize: 24576,
      version: 1,
      isActive: true,
      showInIntake: true,
      isDefault: true,
      uploadedById: "legal@example.com",
      uploadedAt: now,
      lastUpdatedById: "legal@example.com",
      createdAt: now,
      updatedAt: now,
      variables,
    },
    {
      id: "template-vendor-msa-1",
      organizationId,
      title: "Vendor MSA",
      contractType: "vendor",
      description: "Master services agreement for vendor engagements.",
      fileName: "vendor-msa.docx",
      storagePath: `${organizationId}/template-vendor-msa-1/v1/vendor-msa.docx`,
      fileSize: 32768,
      version: 1,
      isActive: true,
      showInIntake: true,
      isDefault: false,
      uploadedById: "legal@example.com",
      uploadedAt: now,
      lastUpdatedById: "legal@example.com",
      createdAt: now,
      updatedAt: now,
      variables: variables.map((variable) => ({
        ...variable,
        id: `${variable.id}-vendor`,
        templateId: "template-vendor-msa-1",
      })),
    },
  ];
}

function getTemplateStore(): ContractTemplateRecord[] {
  if (!globalStore.__contractTemplateStore) {
    globalStore.__contractTemplateStore = seedTemplates();
  }

  return globalStore.__contractTemplateStore;
}

function getVersionStore(): ContractTemplateVersionRecord[] {
  if (!globalStore.__contractTemplateVersionStore) {
    globalStore.__contractTemplateVersionStore = [];
  }

  return globalStore.__contractTemplateVersionStore;
}

function listMemoryTemplates(organizationId: string): ContractTemplateRecord[] {
  return getTemplateStore()
    .filter((template) => template.organizationId === organizationId)
    .sort((a, b) => a.title.localeCompare(b.title));
}

function getMemoryTemplateById(
  id: string,
  organizationId: string,
): ContractTemplateRecord | null {
  return (
    getTemplateStore().find(
      (template) => template.id === id && template.organizationId === organizationId,
    ) ?? null
  );
}

function clearMemoryDefaultForType(
  organizationId: string,
  contractType: ContractTemplateRecord["contractType"],
  excludeTemplateId?: string,
): TemplateDefaultChange | null {
  const store = getTemplateStore();
  const previous = store.find(
    (template) =>
      template.organizationId === organizationId &&
      template.contractType === contractType &&
      template.isDefault &&
      template.id !== excludeTemplateId,
  );

  for (const existing of store) {
    if (
      existing.organizationId === organizationId &&
      existing.contractType === contractType &&
      existing.id !== excludeTemplateId
    ) {
      existing.isDefault = false;
    }
  }

  return previous ? { id: previous.id, title: previous.title } : null;
}

function createMemoryTemplate(
  input: CreateContractTemplateInput,
): TemplateMutationResult {
  const now = new Date().toISOString();
  const templateId = input.id ?? `template-${Date.now()}`;
  const variables: TemplateVariableRecord[] = input.variables.map(
    (variable, index) => ({
      id: `template-var-${Date.now()}-${index}`,
      templateId,
      name: variable.name,
      label: variable.label,
      fieldType: variable.fieldType,
      isRequired: variable.isRequired ?? true,
      defaultValue: variable.defaultValue ?? null,
      selectOptions: variable.selectOptions ?? [],
      helpText: variable.helpText ?? null,
      displayOrder: variable.displayOrder,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const template: ContractTemplateRecord = {
    id: templateId,
    organizationId: input.organizationId,
    title: input.title,
    contractType: input.contractType,
    description: input.description ?? null,
    fileName: input.file.fileName,
    storagePath: input.file.storagePath,
    fileSize: input.file.fileSize,
    version: 1,
    isActive: input.isActive ?? true,
    showInIntake: input.showInIntake ?? true,
    isDefault: input.isDefault ?? false,
    uploadedById: input.uploadedById,
    uploadedAt: now,
    lastUpdatedById: input.uploadedById,
    createdAt: now,
    updatedAt: now,
    variables,
  };

  const previousDefault = input.isDefault
    ? clearMemoryDefaultForType(input.organizationId, input.contractType)
    : null;

  getTemplateStore().unshift(template);
  return {
    template,
    previousDefault,
    versionUploaded: false,
    placeholderWarning: null,
  };
}

function saveMemoryTemplateVersion(
  template: ContractTemplateRecord,
  changeNote: string | null,
): void {
  getVersionStore().unshift({
    id: `template-version-${Date.now()}`,
    templateId: template.id,
    version: template.version,
    fileName: template.fileName,
    storagePath: template.storagePath,
    fileSize: template.fileSize,
    uploadedById: template.lastUpdatedById,
    uploadedAt: template.uploadedAt,
    changeNote,
  });
}

function replaceMemoryTemplateVariables(
  templateId: string,
  variables: TemplateVariableInput[],
): TemplateVariableRecord[] {
  const now = new Date().toISOString();

  return variables.map((variable, index) => ({
    id: `template-var-${Date.now()}-${index}`,
    templateId,
    name: variable.name,
    label: variable.label,
    fieldType: variable.fieldType,
    isRequired: variable.isRequired ?? true,
    defaultValue: variable.defaultValue ?? null,
    selectOptions: variable.selectOptions ?? [],
    helpText: variable.helpText ?? null,
    displayOrder: variable.displayOrder ?? index,
    createdAt: now,
    updatedAt: now,
  }));
}

function updateMemoryTemplate(
  id: string,
  organizationId: string,
  input: UpdateContractTemplateInput,
): TemplateMutationResult | null {
  const store = getTemplateStore();
  const index = store.findIndex(
    (template) => template.id === id && template.organizationId === organizationId,
  );

  if (index === -1) {
    return null;
  }

  const current = store[index];
  const fileChanged = Boolean(input.file);
  const now = new Date().toISOString();

  if (fileChanged) {
    saveMemoryTemplateVersion(current, input.changeNote ?? null);
  }

  const updated: ContractTemplateRecord = {
    ...current,
    title: input.title ?? current.title,
    contractType: input.contractType ?? current.contractType,
    description:
      input.description === undefined ? current.description : input.description,
    fileName: input.file?.fileName ?? current.fileName,
    storagePath: input.file?.storagePath ?? current.storagePath,
    fileSize: input.file?.fileSize ?? current.fileSize,
    isActive: input.isActive ?? current.isActive,
    showInIntake: input.showInIntake ?? current.showInIntake,
    isDefault: input.isDefault ?? current.isDefault,
    version: fileChanged ? current.version + 1 : current.version,
    lastUpdatedById: input.lastUpdatedById,
    uploadedAt: fileChanged ? now : current.uploadedAt,
    updatedAt: now,
    variables: input.variables
      ? replaceMemoryTemplateVariables(current.id, input.variables)
      : current.variables,
  };

  const previousDefault =
    input.isDefault && updated.isDefault
      ? clearMemoryDefaultForType(
          updated.organizationId,
          updated.contractType,
          updated.id,
        )
      : null;

  store[index] = updated;
  return {
    template: updated,
    previousDefault,
    versionUploaded: fileChanged,
    placeholderWarning: null,
  };
}

function listMemoryTemplateVersions(
  templateId: string,
  organizationId: string,
): ContractTemplateVersionRecord[] {
  const template = getMemoryTemplateById(templateId, organizationId);

  if (!template) {
    return [];
  }

  return getVersionStore()
    .filter((version) => version.templateId === templateId)
    .sort((a, b) => b.version - a.version);
}

function buildVariableCreateData(
  variables: TemplateVariableInput[],
): Prisma.TemplateVariableCreateManyTemplateInput[] {
  return variables.map((variable, index) => ({
    name: variable.name,
    label: variable.label,
    fieldType: variable.fieldType,
    isRequired: variable.isRequired ?? true,
    defaultValue: variable.defaultValue ?? null,
    selectOptions:
      variable.fieldType === "select"
        ? (variable.selectOptions ?? [])
        : Prisma.JsonNull,
    helpText: variable.helpText ?? null,
    displayOrder: variable.displayOrder ?? index,
  }));
}

async function clearDefaultTemplateForType(
  tx: Prisma.TransactionClient,
  organizationId: string,
  contractType: ContractTemplateRecord["contractType"],
  excludeTemplateId?: string,
): Promise<TemplateDefaultChange | null> {
  const previous = await tx.contractTemplate.findFirst({
    where: {
      organizationId,
      contractType,
      isDefault: true,
      ...(excludeTemplateId ? { id: { not: excludeTemplateId } } : {}),
    },
    select: { id: true, title: true },
  });

  await tx.contractTemplate.updateMany({
    where: {
      organizationId,
      contractType,
      ...(excludeTemplateId ? { id: { not: excludeTemplateId } } : {}),
    },
    data: { isDefault: false },
  });

  return previous ? { id: previous.id, title: previous.title } : null;
}

export function validateTemplateInput(
  variables: TemplateVariableInput[],
): string | null {
  return validateTemplateVariables(variables);
}

export async function listActiveContractTemplates(
  organizationId: string,
): Promise<ContractTemplateRecord[]> {
  const templates = await listContractTemplates(organizationId);
  return templates.filter((template) => template.isActive);
}

export async function listIntakeContractTemplates(
  organizationId: string,
): Promise<ContractTemplateRecord[]> {
  const templates = await listActiveContractTemplates(organizationId);
  return templates.filter((template) => template.showInIntake);
}

export async function listIntakeContractTemplatesForOrganizations(
  organizationIds: string[],
): Promise<ContractTemplateRecord[]> {
  const templates = await Promise.all(
    organizationIds.map((organizationId) =>
      listIntakeContractTemplates(organizationId),
    ),
  );

  return templates.flat().sort((a, b) => a.title.localeCompare(b.title));
}

export async function listActiveContractTemplatesForOrganizations(
  organizationIds: string[],
): Promise<ContractTemplateRecord[]> {
  const templates = await Promise.all(
    organizationIds.map((organizationId) =>
      listActiveContractTemplates(organizationId),
    ),
  );

  return templates.flat().sort((a, b) => a.title.localeCompare(b.title));
}

export async function countInProgressContractsForTemplate(
  templateId: string,
): Promise<number> {
  return countInProgressContractsUsingTemplate(templateId);
}

export async function getTemplateFileAtVersion(
  templateId: string,
  version: number,
  organizationId: string,
): Promise<TemplateFileReference | null> {
  const template = await getContractTemplateById(templateId, organizationId);

  if (!template) {
    return null;
  }

  if (!Number.isInteger(version) || version < 1 || version > template.version) {
    return null;
  }

  if (version === template.version) {
    return {
      fileName: template.fileName,
      storagePath: template.storagePath,
      fileSize: template.fileSize,
      version: template.version,
    };
  }

  if (!isDatabaseConfigured()) {
    const archived = getVersionStore().find(
      (entry) => entry.templateId === templateId && entry.version === version,
    );

    return archived
      ? {
          fileName: archived.fileName,
          storagePath: archived.storagePath,
          fileSize: archived.fileSize,
          version: archived.version,
        }
      : null;
  }

  try {
    const prisma = getPrismaClient();
    const archived = await prisma.contractTemplateVersion.findUnique({
      where: {
        templateId_version: {
          templateId,
          version,
        },
      },
    });

    return archived
      ? {
          fileName: archived.fileName,
          storagePath: archived.storagePath,
          fileSize: archived.fileSize,
          version: archived.version,
        }
      : null;
  } catch (error) {
    console.error("Failed to resolve template file version:", error);

    const archived = getVersionStore().find(
      (entry) => entry.templateId === templateId && entry.version === version,
    );

    return archived
      ? {
          fileName: archived.fileName,
          storagePath: archived.storagePath,
          fileSize: archived.fileSize,
          version: archived.version,
        }
      : null;
  }
}

export async function validateIntakeTemplateReference(
  templateId: string,
  templateVersion: number | undefined,
  organizationId: string,
): Promise<{ templateId: string; templateVersion: number } | null> {
  const template = await getContractTemplateById(templateId, organizationId);

  if (!template || !template.isActive) {
    return null;
  }

  const version = templateVersion ?? template.version;

  if (!Number.isInteger(version) || version < 1 || version > template.version) {
    return null;
  }

  return {
    templateId: template.id,
    templateVersion: version,
  };
}

export async function listContractTemplates(
  organizationId: string,
): Promise<ContractTemplateRecord[]> {
  if (allowMemoryPersistence()) {
    return listMemoryTemplates(organizationId);
  }

  try {
    const prisma = getPrismaClient();

    if (!prisma.contractTemplate?.findMany) {
      throw new Error(
        "Prisma client is missing contractTemplate delegate. Run `npx prisma generate`.",
      );
    }

    const records = await prisma.contractTemplate.findMany({
      where: { organizationId },
      include: {
        variables: {
          orderBy: [{ displayOrder: "asc" }],
        },
      },
      orderBy: [
        { isDefault: "desc" },
        { contractType: "asc" },
        { createdAt: "desc" },
      ],
    });

    return records.map(mapTemplateRecord);
  } catch (error) {
    console.error("Failed to list contract templates:", error);
    throw error;
  }
}

export async function getContractTemplateById(
  id: string,
  organizationId: string,
): Promise<ContractTemplateRecord | null> {
  if (!isDatabaseConfigured()) {
    return getMemoryTemplateById(id, organizationId);
  }

  try {
    const prisma = getPrismaClient();
    const record = await prisma.contractTemplate.findFirst({
      where: { id, organizationId },
      include: {
        variables: {
          orderBy: [{ displayOrder: "asc" }],
        },
      },
    });

    return record
      ? mapTemplateRecord(record)
      : getMemoryTemplateById(id, organizationId);
  } catch (error) {
    console.error("Failed to load contract template:", error);
    return getMemoryTemplateById(id, organizationId);
  }
}

export async function createContractTemplate(
  input: CreateContractTemplateInput,
  options?: TemplateMutationOptions,
): Promise<TemplateMutationResult> {
  const validationError = validateTemplateInput(input.variables);

  if (validationError) {
    throw new Error(validationError);
  }

  if (!isDatabaseConfigured()) {
    const result = createMemoryTemplate(input);
    await recordTemplateAuditLog({
      organizationId: input.organizationId,
      entityId: result.template.id,
      action: "template_created",
      detail: `Template "${result.template.title}" created for ${getContractTypeLabel(result.template.contractType)} contracts`,
      actorEmail: input.uploadedById,
      actorName: options?.actorName ?? null,
      metadata: {
        templateTitle: result.template.title,
        contractType: result.template.contractType,
        version: result.template.version,
      },
    });
    return {
      ...result,
      placeholderWarning: options?.placeholderWarning ?? null,
    };
  }

  try {
    const prisma = getPrismaClient();
    const now = new Date();
    const templateId = input.id ?? `template-${Date.now()}`;

    const { record, previousDefault } = await prisma.$transaction(async (tx) => {
      let previousDefault: TemplateDefaultChange | null = null;

      if (input.isDefault) {
        previousDefault = await clearDefaultTemplateForType(
          tx,
          input.organizationId,
          input.contractType,
        );
      }

      const created = await tx.contractTemplate.create({
        data: {
          id: templateId,
          organizationId: input.organizationId,
          title: input.title,
          contractType: input.contractType,
          description: input.description ?? null,
          fileName: input.file.fileName,
          storagePath: input.file.storagePath,
          fileSize: input.file.fileSize,
          isActive: input.isActive ?? true,
          showInIntake: input.showInIntake ?? true,
          isDefault: input.isDefault ?? false,
          uploadedById: input.uploadedById,
          uploadedAt: now,
          lastUpdatedById: input.uploadedById,
          variables: {
            createMany: {
              data: buildVariableCreateData(input.variables),
            },
          },
        },
        include: {
          variables: {
            orderBy: [{ displayOrder: "asc" }],
          },
        },
      });

      return { record: created, previousDefault };
    });

    const template = mapTemplateRecord(record);

    try {
      await recordTemplateAuditLog({
        organizationId: input.organizationId,
        entityId: template.id,
        action: "template_created",
        detail: `Template "${template.title}" created for ${getContractTypeLabel(template.contractType)} contracts`,
        actorEmail: input.uploadedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: template.title,
          contractType: template.contractType,
          version: template.version,
        },
      });
    } catch (auditError) {
      console.error("Failed to record template audit log:", auditError);
    }

    return {
      template,
      previousDefault,
      versionUploaded: false,
      placeholderWarning: options?.placeholderWarning ?? null,
    };
  } catch (error) {
    console.error("Failed to create contract template:", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to create contract template.");
  }
}

export async function updateContractTemplate(
  id: string,
  organizationId: string,
  input: UpdateContractTemplateInput,
  options?: TemplateMutationOptions,
): Promise<TemplateMutationResult | null> {
  if (input.variables) {
    const validationError = validateTemplateInput(input.variables);

    if (validationError) {
      throw new Error(validationError);
    }
  }

  async function persistMemoryTemplateUpdate(): Promise<TemplateMutationResult | null> {
    const existing = getMemoryTemplateById(id, organizationId);
    const wasActive = existing?.isActive ?? true;
    const result = updateMemoryTemplate(id, organizationId, input);

    if (!result) {
      return null;
    }

    if (input.isActive === false && wasActive) {
      await recordTemplateAuditLog({
        organizationId,
        entityId: result.template.id,
        action: "template_deactivated",
        detail: `Template "${result.template.title}" deactivated. Will no longer appear in intake form.`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: result.template.title,
          contractType: result.template.contractType,
          version: result.template.version,
        },
      });
    } else if (input.isActive === true && !wasActive) {
      await recordTemplateAuditLog({
        organizationId,
        entityId: result.template.id,
        action: "template_activated",
        detail: `Template "${result.template.title}" reactivated.`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: result.template.title,
          contractType: result.template.contractType,
          version: result.template.version,
        },
      });
    } else if (result.versionUploaded) {
      await recordTemplateAuditLog({
        organizationId,
        entityId: result.template.id,
        action: "template_version_uploaded",
        detail: `New version (v${result.template.version}) uploaded for template "${result.template.title}"`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: result.template.title,
          contractType: result.template.contractType,
          version: result.template.version,
          changeNote: input.changeNote ?? null,
        },
      });
    } else {
      await recordTemplateAuditLog({
        organizationId,
        entityId: result.template.id,
        action: "template_updated",
        detail: `Template "${result.template.title}" settings updated`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: result.template.title,
          contractType: result.template.contractType,
          version: result.template.version,
          fieldsUpdated: Object.keys(input).filter(
            (key) => key !== "lastUpdatedById",
          ),
        },
      });
    }

    if (result.previousDefault) {
      await recordTemplateAuditLog({
        organizationId,
        entityId: result.template.id,
        action: "template_set_as_default",
        detail: `Template "${result.template.title}" set as default for ${getContractTypeLabel(result.template.contractType)} contracts`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: result.template.title,
          contractType: result.template.contractType,
          version: result.template.version,
          previousDefault: result.previousDefault.title,
        },
      });
    }

    return {
      ...result,
      placeholderWarning: options?.placeholderWarning ?? null,
    };
  }

  if (!isDatabaseConfigured()) {
    return persistMemoryTemplateUpdate();
  }

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.contractTemplate.findFirst({
      where: { id, organizationId },
      include: {
        variables: {
          orderBy: [{ displayOrder: "asc" }],
        },
      },
    });

    if (!existing) {
      return persistMemoryTemplateUpdate();
    }

    const fileChanged = Boolean(input.file);
    const now = new Date();
    const nextVersion = fileChanged ? existing.version + 1 : existing.version;
    const wasActive = existing.isActive;

    const { record, previousDefault } = await prisma.$transaction(async (tx) => {
      let previousDefault: TemplateDefaultChange | null = null;

      if (fileChanged) {
        await tx.contractTemplateVersion.create({
          data: {
            templateId: existing.id,
            version: existing.version,
            fileName: existing.fileName,
            storagePath: existing.storagePath,
            fileSize: existing.fileSize,
            uploadedById: existing.lastUpdatedById,
            uploadedAt: existing.uploadedAt,
            changeNote: input.changeNote ?? null,
          },
        });
      }

      if (input.isDefault) {
        previousDefault = await clearDefaultTemplateForType(
          tx,
          organizationId,
          input.contractType ?? existing.contractType,
          existing.id,
        );
      }

      if (input.variables) {
        await tx.templateVariable.deleteMany({
          where: { templateId: existing.id },
        });
      }

      const updated = await tx.contractTemplate.update({
        where: { id },
        data: {
          title: input.title,
          contractType: input.contractType,
          description: input.description,
          fileName: input.file?.fileName,
          storagePath: input.file?.storagePath,
          fileSize: input.file?.fileSize,
          isActive: input.isActive,
          showInIntake: input.showInIntake,
          isDefault: input.isDefault,
          version: nextVersion,
          lastUpdatedById: input.lastUpdatedById,
          uploadedAt: fileChanged ? now : undefined,
          ...(input.variables
            ? {
                variables: {
                  createMany: {
                    data: buildVariableCreateData(input.variables),
                  },
                },
              }
            : {}),
        },
        include: {
          variables: {
            orderBy: [{ displayOrder: "asc" }],
          },
        },
      });

      return { record: updated, previousDefault };
    });

    const template = mapTemplateRecord(record);

    if (input.isActive === false && wasActive) {
      await recordTemplateAuditLog({
        organizationId,
        entityId: template.id,
        action: "template_deactivated",
        detail: `Template "${template.title}" deactivated. Will no longer appear in intake form.`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: template.title,
          contractType: template.contractType,
          version: template.version,
        },
      });
    } else if (input.isActive === true && !wasActive) {
      await recordTemplateAuditLog({
        organizationId,
        entityId: template.id,
        action: "template_activated",
        detail: `Template "${template.title}" reactivated.`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: template.title,
          contractType: template.contractType,
          version: template.version,
        },
      });
    } else if (fileChanged) {
      await recordTemplateAuditLog({
        organizationId,
        entityId: template.id,
        action: "template_version_uploaded",
        detail: `New version (v${template.version}) uploaded for template "${template.title}"`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: template.title,
          contractType: template.contractType,
          version: template.version,
          changeNote: input.changeNote ?? null,
        },
      });
    } else {
      await recordTemplateAuditLog({
        organizationId,
        entityId: template.id,
        action: "template_updated",
        detail: `Template "${template.title}" settings updated`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: template.title,
          contractType: template.contractType,
          version: template.version,
          fieldsUpdated: Object.keys(input).filter(
            (key) => key !== "lastUpdatedById",
          ),
        },
      });
    }

    if (previousDefault) {
      await recordTemplateAuditLog({
        organizationId,
        entityId: template.id,
        action: "template_set_as_default",
        detail: `Template "${template.title}" set as default for ${getContractTypeLabel(template.contractType)} contracts`,
        actorEmail: input.lastUpdatedById,
        actorName: options?.actorName ?? null,
        metadata: {
          templateTitle: template.title,
          contractType: template.contractType,
          version: template.version,
          previousDefault: previousDefault.title,
        },
      });
    }

    return {
      template,
      previousDefault,
      versionUploaded: fileChanged,
      placeholderWarning: options?.placeholderWarning ?? null,
    };
  } catch (error) {
    console.error("Failed to update contract template:", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to update contract template.");
  }
}

export async function listContractTemplateVersions(
  templateId: string,
  organizationId: string,
): Promise<ContractTemplateVersionRecord[]> {
  if (!isDatabaseConfigured()) {
    return listMemoryTemplateVersions(templateId, organizationId);
  }

  try {
    const prisma = getPrismaClient();
    const template = await prisma.contractTemplate.findFirst({
      where: { id: templateId, organizationId },
      select: { id: true },
    });

    if (!template) {
      return listMemoryTemplateVersions(templateId, organizationId);
    }

    const records = await prisma.contractTemplateVersion.findMany({
      where: { templateId },
      orderBy: [{ version: "desc" }],
    });

    return records.map(mapVersionRecord);
  } catch (error) {
    console.error("Failed to list contract template versions:", error);
    return listMemoryTemplateVersions(templateId, organizationId);
  }
}

export async function listTemplateVersionHistory(
  templateId: string,
  organizationId: string,
): Promise<TemplateVersionHistoryEntry[]> {
  const template = await getContractTemplateById(templateId, organizationId);

  if (!template) {
    return [];
  }

  const archived = await listContractTemplateVersions(templateId, organizationId);
  const current: TemplateVersionHistoryEntry = {
    id: `${template.id}-current`,
    templateId: template.id,
    version: template.version,
    fileName: template.fileName,
    storagePath: template.storagePath,
    fileSize: template.fileSize,
    uploadedById: template.lastUpdatedById,
    uploadedAt: template.uploadedAt,
    changeNote: null,
    isCurrent: true,
  };

  const archivedEntries = archived
    .filter((entry) => entry.version !== template.version)
    .map((entry) => ({
      ...entry,
      isCurrent: false,
    }));

  return [current, ...archivedEntries].sort((left, right) => right.version - left.version);
}