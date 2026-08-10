import { mergeDocxPlaceholders } from "@/lib/contract-template-docx";
import {
  buildVariableValuesFromIntakeForm,
  type IntakeFormVariableContext,
} from "@/lib/contract-template-intake";
import {
  getContractTemplateById,
  getTemplateFileAtVersion,
} from "@/lib/contract-template-store";
import { isSupabaseStorageConfigured } from "@/lib/supabase-storage";
import {
  buildGeneratedDraftStoragePath,
  downloadTemplateDocument,
  uploadGeneratedDraftDocument,
} from "@/lib/supabase-storage";
import type { ContractIntakeInput, ContractRecord } from "@/types/contract";
import type { ContractTemplateRecord } from "@/types/contract-template";

export interface TemplateMergeOutcome {
  generatedDraftPath: string;
  draftFileName: string;
  missingVariables: string[];
  mergedVariables: string[];
}

function intakeInputToVariableContext(
  input: ContractIntakeInput,
): IntakeFormVariableContext {
  return {
    companyName: input.companyName,
    address: input.address,
    mainContactName: input.mainContactName,
    mainContactTitle: input.mainContactTitle ?? "",
    mainContactEmail: input.mainContactEmail,
    mainContactPhone: input.mainContactPhone ?? "",
    contractStartDate: input.contractStartDate,
    contractEndDate: input.contractEndDate,
    contractAmount: input.contractAmount,
    contractTitle: input.contractTitle,
    poNumber: input.poNumber ?? "",
  };
}

export function resolveTemplateVariableValues(
  template: ContractTemplateRecord | null,
  input: ContractIntakeInput,
): Record<string, string> {
  const submitted = input.templateVariables ?? {};
  const inferred = template
    ? buildVariableValuesFromIntakeForm(
        template,
        intakeInputToVariableContext(input),
      )
    : {};

  return {
    ...inferred,
    ...submitted,
  };
}

export function buildPersistedContractVariables(
  input: ContractIntakeInput,
  templateValues: Record<string, string>,
): Record<string, string> | null {
  const merged = {
    ...(input.customFields ?? {}),
    ...templateValues,
  };

  return Object.keys(merged).length > 0 ? merged : null;
}

function buildDraftFileName(
  contract: Pick<ContractRecord, "recordNumber" | "title">,
): string {
  const safeTitle = contract.title
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);

  return `${contract.recordNumber}-${safeTitle || "draft"}.docx`;
}

export async function mergeContractTemplateDraft(
  contract: ContractRecord,
  input: ContractIntakeInput,
): Promise<TemplateMergeOutcome | null> {
  if (!contract.templateId || !contract.templateVersion) {
    return null;
  }

  if (!isSupabaseStorageConfigured()) {
    return null;
  }

  const organizationId = contract.companyProfileId;
  const template = await getContractTemplateById(
    contract.templateId,
    organizationId,
  );
  const fileReference = await getTemplateFileAtVersion(
    contract.templateId,
    contract.templateVersion,
    organizationId,
  );

  if (!fileReference) {
    throw new Error("Template version not found for this contract.");
  }

  const variableValues = resolveTemplateVariableValues(template, input);
  const templateBuffer = await downloadTemplateDocument(fileReference.storagePath);
  const mergeResult = await mergeDocxPlaceholders(templateBuffer, variableValues);
  const draftFileName = buildDraftFileName(contract);
  const generatedDraftPath = buildGeneratedDraftStoragePath(
    organizationId,
    contract.id,
    draftFileName,
  );

  await uploadGeneratedDraftDocument(
    generatedDraftPath,
    mergeResult.buffer,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );

  return {
    generatedDraftPath,
    draftFileName,
    missingVariables: mergeResult.missingVariables,
    mergedVariables: mergeResult.mergedVariables,
  };
}

export async function mergeContractTemplateDraftFromRecord(
  contract: ContractRecord,
): Promise<TemplateMergeOutcome | null> {
  if (!contract.templateId || !contract.templateVersion) {
    return null;
  }

  const organizationId = contract.companyProfileId;
  const template = await getContractTemplateById(
    contract.templateId,
    organizationId,
  );
  const templateVariableNames = new Set(
    (template?.variables ?? []).map((variable) => variable.name),
  );
  const storedValues = contract.contractVariables ?? {};
  const templateValues = Object.fromEntries(
    Object.entries(storedValues).filter(([key]) =>
      templateVariableNames.has(key),
    ),
  );

  return mergeContractTemplateDraft(contract, {
    requesterName: contract.requesterName,
    requesterEmail: contract.requesterEmail,
    department: contract.department,
    contractType: contract.contractType,
    contractStartDate: contract.contractStartDate,
    contractEndDate: contract.contractEndDate,
    contractTitle: contract.title,
    contractDescription: contract.description,
    contractAmount: contract.amount,
    poNumber: contract.poNumber,
    otherNotes: contract.otherNotes,
    companyName: contract.companyName,
    address: contract.address,
    mainContactName: contract.mainContactName,
    mainContactTitle: contract.mainContactTitle,
    mainContactEmail: contract.mainContactEmail,
    mainContactPhone: contract.mainContactPhone,
    companyProfileId: contract.companyProfileId,
    templateId: contract.templateId,
    templateVersion: contract.templateVersion,
    templateVariables: templateValues,
  });
}
