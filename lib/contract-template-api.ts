import {
  buildPlaceholderWarning,
  extractDocxPlaceholders,
} from "@/lib/contract-template-docx";
import { isActiveContractTypeSlug } from "@/lib/contract-type-store";
import {
  isWordTemplateFile,
  parseTemplateVariableInputs,
  validateTemplateVariables,
} from "@/lib/contract-template-utils";
import {
  buildTemplateStoragePath,
  isSupabaseStorageConfigured,
  uploadTemplateFile,
  validateTemplateFileSize,
} from "@/lib/supabase-storage";
import { safeTrim } from "@/lib/string-utils";
import type {
  CreateContractTemplateInput,
  UpdateContractTemplateInput,
} from "@/types/contract-template";

export function parseBooleanField(
  value: FormDataEntryValue | null,
): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  const normalized = safeTrim(String(value)).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
}

async function readUploadedFile(
  file: File,
): Promise<{ buffer: Buffer; placeholderWarning: string | null; error?: string }> {
  const sizeError = validateTemplateFileSize(file.size);

  if (sizeError) {
    return { buffer: Buffer.from([]), placeholderWarning: null, error: sizeError };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const placeholders = await extractDocxPlaceholders(buffer);

  return {
    buffer,
    placeholderWarning: buildPlaceholderWarning(placeholders),
  };
}

export async function parseCreateFormData(
  formData: FormData,
  organizationId: string,
  uploadedById: string,
): Promise<{
  input?: CreateContractTemplateInput;
  placeholderWarning?: string | null;
  error?: string;
}> {
  const title = safeTrim(String(formData.get("title") ?? ""));
  const contractType = safeTrim(String(formData.get("contractType") ?? ""));
  const descriptionRaw = formData.get("description");
  const description =
    descriptionRaw === null ? null : safeTrim(String(descriptionRaw)) || null;
  const variables = parseTemplateVariableInputs(
    JSON.parse(String(formData.get("variables") ?? "[]")),
  );
  const isActive = parseBooleanField(formData.get("isActive")) ?? true;
  const isDefault = parseBooleanField(formData.get("isDefault")) ?? false;
  const file = formData.get("file");

  if (!title) {
    return { error: "Title is required." };
  }

  if (!(await isActiveContractTypeSlug(organizationId, contractType))) {
    return { error: "Select a valid contract type." };
  }

  if (!(file instanceof File)) {
    return { error: "A Word document (.docx) is required." };
  }

  if (!isWordTemplateFile(file)) {
    return { error: "Upload a Word document (.doc or .docx)." };
  }

  const variableError = validateTemplateVariables(variables);

  if (variableError) {
    return { error: variableError };
  }

  const fileRead = await readUploadedFile(file);

  if (fileRead.error) {
    return { error: fileRead.error };
  }

  const templateId = `template-${Date.now()}`;
  const storagePath = buildTemplateStoragePath(
    organizationId,
    templateId,
    1,
    file.name,
  );

  if (isSupabaseStorageConfigured()) {
    try {
      await uploadTemplateFile(
        storagePath,
        fileRead.buffer,
        file.type ||
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Unable to upload template file.",
      };
    }
  }

  return {
    input: {
      id: templateId,
      organizationId,
      title,
      contractType,
      description,
      file: {
        fileName: file.name,
        storagePath,
        fileSize: file.size,
      },
      variables,
      isActive,
      isDefault,
      uploadedById,
    },
    placeholderWarning: fileRead.placeholderWarning,
  };
}

export async function parseUpdateFormData(
  formData: FormData,
  organizationId: string,
  templateId: string,
  nextVersion: number,
): Promise<{
  input?: UpdateContractTemplateInput;
  placeholderWarning?: string | null;
  error?: string;
}> {
  const input: UpdateContractTemplateInput = {
    lastUpdatedById: "",
  };
  let placeholderWarning: string | null = null;

  if (formData.has("title")) {
    const title = safeTrim(String(formData.get("title") ?? ""));

    if (!title) {
      return { error: "Title cannot be empty." };
    }

    input.title = title;
  }

  if (formData.has("contractType")) {
    const contractType = safeTrim(String(formData.get("contractType") ?? ""));

    if (!(await isActiveContractTypeSlug(organizationId, contractType))) {
      return { error: "Select a valid contract type." };
    }

    input.contractType = contractType;
  }

  if (formData.has("description")) {
    const descriptionRaw = formData.get("description");
    input.description =
      descriptionRaw === null ? null : safeTrim(String(descriptionRaw)) || null;
  }

  if (formData.has("variables")) {
    const variables = parseTemplateVariableInputs(
      JSON.parse(String(formData.get("variables") ?? "[]")),
    );
    const variableError = validateTemplateVariables(variables);

    if (variableError) {
      return { error: variableError };
    }

    input.variables = variables;
  }

  if (formData.has("isActive")) {
    input.isActive = parseBooleanField(formData.get("isActive")) ?? false;
  }

  if (formData.has("isDefault")) {
    input.isDefault = parseBooleanField(formData.get("isDefault")) ?? false;
  }

  if (formData.has("changeNote")) {
    const changeNote = safeTrim(String(formData.get("changeNote") ?? ""));
    input.changeNote = changeNote || null;
  }

  const file = formData.get("file");

  if (file instanceof File && file.size > 0) {
    if (!isWordTemplateFile(file)) {
      return { error: "Upload a Word document (.doc or .docx)." };
    }

    const fileRead = await readUploadedFile(file);

    if (fileRead.error) {
      return { error: fileRead.error };
    }

    placeholderWarning = fileRead.placeholderWarning;

    const storagePath = buildTemplateStoragePath(
      organizationId,
      templateId,
      nextVersion,
      file.name,
    );

    if (isSupabaseStorageConfigured()) {
      try {
        await uploadTemplateFile(
          storagePath,
          fileRead.buffer,
          file.type ||
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "Unable to upload template file.",
        };
      }
    }

    input.file = {
      fileName: file.name,
      storagePath,
      fileSize: file.size,
    };
  }

  const hasUpdates =
    input.title !== undefined ||
    input.contractType !== undefined ||
    input.description !== undefined ||
    input.variables !== undefined ||
    input.isActive !== undefined ||
    input.isDefault !== undefined ||
    input.file !== undefined;

  if (!hasUpdates) {
    return { error: "No valid fields provided for update." };
  }

  return { input, placeholderWarning };
}
